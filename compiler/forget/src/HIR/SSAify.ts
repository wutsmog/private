import invariant from "invariant";
import { assertExhaustive } from "../Common/utils";
import {
  BasicBlock,
  BlockId,
  Effect,
  HIRFunction,
  IdentifierId,
  Instruction,
  InstructionKind,
  Phi,
  Place,
} from "./HIR";
import { Environment } from "./HIRBuilder";

type IncompletePhi = {
  old: Place;
  new: Place;
};

type State = {
  defs: Map<IdentifierId, Place>;
  incompletePhis: IncompletePhi[];
};

const unsealedPreds: Map<BasicBlock, number> = new Map();

class SSABuilder {
  #states: Map<BasicBlock, State> = new Map();
  #current: BasicBlock | null = null;
  visitedBlocks: Set<BasicBlock> = new Set();
  #env: Environment;

  constructor(env: Environment) {
    this.#env = env;
  }

  get nextIdentifierId() {
    return this.#env.nextIdentifierId;
  }

  // Hack(gsn): Start from the last stored id in HIRBuilder.
  // Need to refactor makeTemporary and relevant state out of HIR Builder.
  #id = 1000;

  state(): State {
    invariant(
      this.#current !== null,
      "we need to be in a block to access state!"
    );
    return this.#states.get(this.#current)!;
  }

  // This tries to reuse all existing information about the oldPlace in case there's
  // useful information from previous compiler passes.
  makePlace(oldPlace: Place): Place {
    const identifier = {
      ...oldPlace.identifier,
      id: this.nextIdentifierId,
    };
    return {
      ...oldPlace,
      identifier,
    };
  }

  makePlaceForPhi(oldPlace: Place): Place {
    const identifier = {
      ...oldPlace.identifier,
      id: this.nextIdentifierId,
    };
    return {
      identifier,
      kind: "Identifier",
      memberPath: null,
      effect: Effect.Mutate,
      path: null as any,
    };
  }

  definePlace(oldPlace: Place): Place {
    const newPlace = this.makePlace(oldPlace);
    this.state().defs.set(oldPlace.identifier.id, newPlace);
    return newPlace;
  }

  getPlace(oldPlace: Place): Place {
    return this.getPlaceAt(oldPlace, this.#current!);
  }

  getPlaceAt(oldPlace: Place, block: BasicBlock): Place {
    // check if Place is defined locally
    const state = this.#states.get(block)!;

    if (state.defs.has(oldPlace.identifier.id)) {
      return state.defs.get(oldPlace.identifier.id)!;
    }

    if (block.preds.size == 0) {
      // We're at the entry block and haven't found our defintion yet.
      throw new Error(`Unable to find \$${oldPlace.identifier.id}`);
    }

    if (unsealedPreds.get(block)! > 0) {
      // We haven't visited all our predecessors, let's place an incomplete phi
      // for now.
      const newPlace = this.makePlaceForPhi(oldPlace);
      state.incompletePhis.push({ old: oldPlace, new: newPlace });
      state.defs.set(oldPlace.identifier.id, newPlace);
      return newPlace;
    }

    // Only one predecessor, let's check there
    if (block.preds.size == 1) {
      const [pred] = block.preds;
      const newPlace = this.getPlaceAt(oldPlace, pred);
      state.defs.set(oldPlace.identifier.id, newPlace);
      return newPlace;
    }

    // There are multiple predecessors, we need a phi.
    const newPlace = this.makePlaceForPhi(oldPlace);
    // Adding a phi may loop back to our block if there is a loop in the CFG.  We
    // update our defs before adding the phi to terminate the recursion rather than
    // looping infinitely.
    state.defs.set(oldPlace.identifier.id, newPlace);
    this.addPhi(block, oldPlace, newPlace);

    // TODO(gsn): Can we just return `newPlace` rather than looking it up?
    // `addPhi` _can_ mutate it, but _will_ it?
    return state.defs.get(oldPlace.identifier.id)!;
  }

  addPhi(block: BasicBlock, oldPlace: Place, newPlace: Place) {
    const predDefs: Map<BasicBlock, Place> = new Map();
    for (const predBlock of block.preds) {
      const predPlace = this.getPlaceAt(oldPlace, predBlock);
      predDefs.set(predBlock, predPlace);
    }

    const phi: Phi = {
      kind: "Phi",
      lvalue: { place: newPlace, kind: InstructionKind.Const },
      operands: predDefs,
    };

    block.phis.add(phi);
  }

  fixIncompletePhis(block: BasicBlock) {
    const state = this.#states.get(block)!;
    for (const phi of state.incompletePhis) {
      this.addPhi(block, phi.old, phi.new);
    }
  }

  startBlock(block: BasicBlock) {
    this.#current = block;
    this.#states.set(block, {
      defs: new Map(),
      incompletePhis: [],
    });
  }

  print() {
    const text = [];
    for (const [block, state] of this.#states) {
      text.push(`bb${block.id}:`);
      for (const [id, place] of state.defs) {
        text.push(`  \$${id} = \$${place.identifier.id}`);
      }

      for (const incompletePhi of state.incompletePhis) {
        text.push(
          `  iphi \$${incompletePhi.new.identifier} = \$${incompletePhi.old.identifier}`
        );
      }
    }

    text.push(`current block: bb${this.#current?.id}`);
    console.log(text.join("\n"));
  }
}

export default function buildSSA(func: HIRFunction, env: Environment) {
  const builder = new SSABuilder(env);
  function visit(blockId: BlockId) {
    const block = func.body.blocks.get(blockId)!;
    if (builder.visitedBlocks.has(block)) {
      return;
    }
    builder.visitedBlocks.add(block);

    builder.startBlock(block);
    for (const instr of block.instructions) {
      const uses = collectUses(instr);
      for (const { place, updateFn } of uses) {
        updateFn(builder.getPlace(place));
      }

      if (instr.lvalue != null) {
        const oldPlace = instr.lvalue.place;
        const newPlace: Place = builder.definePlace(oldPlace);
        instr.lvalue.place = newPlace;
      }
    }

    const { uses, outputs } = collectOutputs(block);
    for (const { place, updateFn } of uses) {
      updateFn(builder.getPlace(place));
    }

    const outputBlocks = outputs.map((id) => func.body.blocks.get(id)!);
    for (const output of outputBlocks) {
      let count;
      if (unsealedPreds.has(output)) {
        count = unsealedPreds.get(output)! - 1;
      } else {
        count = output.preds.size - 1;
      }
      unsealedPreds.set(output, count);

      if (count == 0 && builder.visitedBlocks.has(output)) {
        builder.fixIncompletePhis(output);
      }
    }

    for (const output of outputs) {
      visit(output);
    }
  }

  visit(func.body.entry);
}

function collectOutputs(block: BasicBlock): {
  uses: Array<Uses>;
  outputs: Array<BlockId>;
} {
  const outputs: Array<BlockId> = [];
  const uses: Array<Uses> = [];
  const { terminal } = block;
  switch (terminal.kind) {
    case "return":
    case "throw": {
      if (terminal.value) {
        uses.push({
          place: terminal.value,
          updateFn: (newPlace) => {
            terminal.value = newPlace;
          },
        });
      }
      break;
    }
    case "goto": {
      outputs.push(terminal.block);
      break;
    }
    case "if": {
      const { test, consequent, alternate } = terminal;
      uses.push({
        place: test,
        updateFn: (newPlace) => {
          terminal.test = newPlace;
        },
      });
      outputs.push(alternate);
      outputs.push(consequent);
      break;
    }
    case "switch": {
      const { test, cases } = terminal;
      uses.push({
        place: test,
        updateFn: (newPlace) => {
          terminal.test = newPlace;
        },
      });
      for (const case_ of [...cases].reverse()) {
        if (case_.test) {
          uses.push({
            place: case_.test,
            updateFn: (newPlace) => {
              case_.test = newPlace;
            },
          });
        }
        outputs.push(case_.block);
      }
      break;
    }
    default: {
      assertExhaustive(
        terminal,
        `Unexpected terminal kind '${(terminal as any).kind}'`
      );
    }
  }

  return { uses, outputs };
}

type Uses = {
  place: Place;
  updateFn: (place: Place) => void;
};

function collectUses(instr: Instruction): Array<Uses> {
  const uses: Array<Uses> = [];
  const instrValue = instr.value;

  // TODO(gsn): Handle more kinds of Instructions
  switch (instrValue.kind) {
    case "BinaryExpression": {
      uses.push({
        place: instrValue.left,
        updateFn: (newPlace) => {
          instrValue.left = newPlace;
        },
      });
      uses.push({
        place: instrValue.right,
        updateFn: (newPlace) => {
          instrValue.right = newPlace;
        },
      });
      break;
    }
    case "Identifier": {
      uses.push({
        place: instrValue,
        updateFn: (newPlace) => {
          instr.value = newPlace;
        },
      });
      break;
    }
  }
  return uses;
}
