/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {CompilerError} from '../CompilerError';
import {Environment} from '../HIR';
import {
  areEqualPaths,
  BlockId,
  DeclarationId,
  GeneratedSource,
  Identifier,
  InstructionId,
  InstructionKind,
  isObjectMethodType,
  isRefValueType,
  isUseRefType,
  makeInstructionId,
  Place,
  PrunedReactiveScopeBlock,
  ReactiveFunction,
  ReactiveInstruction,
  ReactiveOptionalCallValue,
  ReactiveScope,
  ReactiveScopeBlock,
  ReactiveScopeDependency,
  ReactiveTerminalStatement,
  ReactiveValue,
  ScopeId,
} from '../HIR/HIR';
import {eachInstructionValueOperand, eachPatternOperand} from '../HIR/visitors';
import {empty, Stack} from '../Utils/Stack';
import {assertExhaustive, Iterable_some} from '../Utils/utils';
import {
  ReactiveScopeDependencyTree,
  ReactiveScopePropertyDependency,
} from './DeriveMinimalDependencies';
import {ReactiveFunctionVisitor, visitReactiveFunction} from './visitors';

/*
 * Infers the dependencies of each scope to include variables whose values
 * are non-stable and created prior to the start of the scope. Also propagates
 * dependencies upwards, so that parent scope dependencies are the union of
 * their direct dependencies and those of their child scopes.
 */
export function propagateScopeDependencies(fn: ReactiveFunction): void {
  const escapingTemporaries: TemporariesUsedOutsideDefiningScope = {
    declarations: new Map(),
    usedOutsideDeclaringScope: new Set(),
  };
  visitReactiveFunction(fn, new FindPromotedTemporaries(), escapingTemporaries);

  const context = new Context(escapingTemporaries.usedOutsideDeclaringScope);
  for (const param of fn.params) {
    if (param.kind === 'Identifier') {
      context.declare(param.identifier, {
        id: makeInstructionId(0),
        scope: empty(),
      });
    } else {
      context.declare(param.place.identifier, {
        id: makeInstructionId(0),
        scope: empty(),
      });
    }
  }
  visitReactiveFunction(fn, new PropagationVisitor(fn.env), context);
}

type TemporariesUsedOutsideDefiningScope = {
  /*
   * tracks all relevant temporary declarations (currently LoadLocal and PropertyLoad)
   * and the scope where they are defined
   */
  declarations: Map<DeclarationId, ScopeId>;
  // temporaries used outside of their defining scope
  usedOutsideDeclaringScope: Set<DeclarationId>;
};
class FindPromotedTemporaries extends ReactiveFunctionVisitor<TemporariesUsedOutsideDefiningScope> {
  scopes: Array<ScopeId> = [];

  override visitScope(
    scope: ReactiveScopeBlock,
    state: TemporariesUsedOutsideDefiningScope,
  ): void {
    this.scopes.push(scope.scope.id);
    this.traverseScope(scope, state);
    this.scopes.pop();
  }

  override visitInstruction(
    instruction: ReactiveInstruction,
    state: TemporariesUsedOutsideDefiningScope,
  ): void {
    // Visit all places first, then record temporaries which may need to be promoted
    this.traverseInstruction(instruction, state);

    const scope = this.scopes.at(-1);
    if (instruction.lvalue === null || scope === undefined) {
      return;
    }
    switch (instruction.value.kind) {
      case 'LoadLocal':
      case 'LoadContext':
      case 'PropertyLoad': {
        state.declarations.set(
          instruction.lvalue.identifier.declarationId,
          scope,
        );
        break;
      }
      default: {
        break;
      }
    }
  }

  override visitPlace(
    _id: InstructionId,
    place: Place,
    state: TemporariesUsedOutsideDefiningScope,
  ): void {
    const declaringScope = state.declarations.get(
      place.identifier.declarationId,
    );
    if (declaringScope === undefined) {
      return;
    }
    if (this.scopes.indexOf(declaringScope) === -1) {
      // Declaring scope is not active === used outside declaring scope
      state.usedOutsideDeclaringScope.add(place.identifier.declarationId);
    }
  }
}

type DeclMap = Map<DeclarationId, Decl>;
type Decl = {
  id: InstructionId;
  scope: Stack<ScopeTraversalState>;
};

/**
 * TraversalState and PoisonState is used to track the poisoned state of a scope.
 *
 * A scope is poisoned when either of these conditions hold:
 * - one of its own nested blocks is a jump target (for break/continues)
 * - it is a outermost scope and contains a throw / return
 *
 * When a scope is poisoned, all dependencies (from instructions and inner scopes)
 * are added as conditionally accessed.
 */
type ScopeTraversalState = {
  value: ReactiveScope;
  ownBlocks: Stack<BlockId>;
};

class PoisonState {
  poisonedBlocks: Set<BlockId> = new Set();
  poisonedScopes: Set<ScopeId> = new Set();
  isPoisoned: boolean = false;

  constructor(
    poisonedBlocks: Set<BlockId>,
    poisonedScopes: Set<ScopeId>,
    isPoisoned: boolean,
  ) {
    this.poisonedBlocks = poisonedBlocks;
    this.poisonedScopes = poisonedScopes;
    this.isPoisoned = isPoisoned;
  }

  clone(): PoisonState {
    return new PoisonState(
      new Set(this.poisonedBlocks),
      new Set(this.poisonedScopes),
      this.isPoisoned,
    );
  }

  take(other: PoisonState): PoisonState {
    const copy = new PoisonState(
      this.poisonedBlocks,
      this.poisonedScopes,
      this.isPoisoned,
    );
    this.poisonedBlocks = other.poisonedBlocks;
    this.poisonedScopes = other.poisonedScopes;
    this.isPoisoned = other.isPoisoned;
    return copy;
  }

  merge(
    others: Array<PoisonState>,
    currentScope: ScopeTraversalState | null,
  ): void {
    for (const other of others) {
      for (const id of other.poisonedBlocks) {
        this.poisonedBlocks.add(id);
      }
      for (const id of other.poisonedScopes) {
        this.poisonedScopes.add(id);
      }
    }
    this.#invalidate(currentScope);
  }

  #invalidate(currentScope: ScopeTraversalState | null): void {
    if (currentScope != null) {
      if (this.poisonedScopes.has(currentScope.value.id)) {
        this.isPoisoned = true;
        return;
      } else if (
        currentScope.ownBlocks.find(blockId => this.poisonedBlocks.has(blockId))
      ) {
        this.isPoisoned = true;
        return;
      }
    }
    this.isPoisoned = false;
  }

  /**
   * Mark a block or scope as poisoned and update the `isPoisoned` flag.
   *
   * @param targetBlock id of the block which ends non-linear control flow.
   *   For a break/continue instruction, this is the target block.
   *   Throw and return instructions have no target and will poison the earliest
   *   active scope
   */
  addPoisonTarget(
    target: BlockId | null,
    activeScopes: Stack<ScopeTraversalState>,
  ): void {
    const currentScope = activeScopes.value;
    if (target == null && currentScope != null) {
      let cursor = activeScopes;
      while (true) {
        const next = cursor.pop();
        if (next.value == null) {
          const poisonedScope = cursor.value!.value.id;
          this.poisonedScopes.add(poisonedScope);
          if (poisonedScope === currentScope?.value.id) {
            this.isPoisoned = true;
          }
          break;
        } else {
          cursor = next;
        }
      }
    } else if (target != null) {
      this.poisonedBlocks.add(target);
      if (
        !this.isPoisoned &&
        currentScope?.ownBlocks.find(blockId => blockId === target)
      ) {
        this.isPoisoned = true;
      }
    }
  }

  /**
   * Invoked during traversal when a poisoned scope becomes inactive
   * @param id
   * @param currentScope
   */
  removeMaybePoisonedScope(
    id: ScopeId,
    currentScope: ScopeTraversalState | null,
  ): void {
    this.poisonedScopes.delete(id);
    this.#invalidate(currentScope);
  }

  removeMaybePoisonedBlock(
    id: BlockId,
    currentScope: ScopeTraversalState | null,
  ): void {
    this.poisonedBlocks.delete(id);
    this.#invalidate(currentScope);
  }
}

class Context {
  #temporariesUsedOutsideScope: Set<DeclarationId>;
  #declarations: DeclMap = new Map();
  #reassignments: Map<Identifier, Decl> = new Map();
  // Reactive dependencies used in the current reactive scope.
  #dependencies: ReactiveScopeDependencyTree =
    new ReactiveScopeDependencyTree();
  /*
   * We keep a sidemap for temporaries created by PropertyLoads, and do
   * not store any control flow (i.e. #inConditionalWithinScope) here.
   *  - a ReactiveScope (A) containing a PropertyLoad may differ from the
   *    ReactiveScope (B) that uses the produced temporary.
   *  - codegen will inline these PropertyLoads back into scope (B)
   */
  #properties: Map<Identifier, ReactiveScopePropertyDependency> = new Map();
  #temporaries: Map<Identifier, Place> = new Map();
  #inConditionalWithinScope: boolean = false;
  /*
   * Reactive dependencies used unconditionally in the current conditional.
   * Composed of dependencies:
   *  - directly accessed within block (added in visitDep)
   *  - accessed by all cfg branches (added through promoteDeps)
   */
  #depsInCurrentConditional: ReactiveScopeDependencyTree =
    new ReactiveScopeDependencyTree();
  #scopes: Stack<ScopeTraversalState> = empty();
  poisonState: PoisonState = new PoisonState(new Set(), new Set(), false);

  constructor(temporariesUsedOutsideScope: Set<DeclarationId>) {
    this.#temporariesUsedOutsideScope = temporariesUsedOutsideScope;
  }

  enter(scope: ReactiveScope, fn: () => void): Set<ReactiveScopeDependency> {
    // Save context of previous scope
    const prevInConditional = this.#inConditionalWithinScope;
    const previousDependencies = this.#dependencies;
    const prevDepsInConditional: ReactiveScopeDependencyTree | null = this
      .isPoisoned
      ? this.#depsInCurrentConditional
      : null;
    if (prevDepsInConditional != null) {
      this.#depsInCurrentConditional = new ReactiveScopeDependencyTree();
    }

    /*
     * Set context for new scope
     * A nested scope should add all deps it directly uses as its own
     * unconditional deps, regardless of whether the nested scope is itself
     * within a conditional
     */
    const scopedDependencies = new ReactiveScopeDependencyTree();
    this.#inConditionalWithinScope = false;
    this.#dependencies = scopedDependencies;
    this.#scopes = this.#scopes.push({
      value: scope,
      ownBlocks: empty(),
    });
    this.poisonState.isPoisoned = false;

    fn();

    // Restore context of previous scope
    this.#scopes = this.#scopes.pop();
    this.poisonState.removeMaybePoisonedScope(scope.id, this.#scopes.value);

    this.#dependencies = previousDependencies;
    this.#inConditionalWithinScope = prevInConditional;

    // Derive minimal dependencies now, since next line may mutate scopedDependencies
    const minInnerScopeDependencies =
      scopedDependencies.deriveMinimalDependencies();

    /*
     * propagate dependencies upward using the same rules as normal dependency
     * collection. child scopes may have dependencies on values created within
     * the outer scope, which necessarily cannot be dependencies of the outer
     * scope
     */
    this.#dependencies.addDepsFromInnerScope(
      scopedDependencies,
      this.#inConditionalWithinScope || this.isPoisoned,
      this.#checkValidDependency.bind(this),
    );

    if (prevDepsInConditional != null) {
      // Outer scope is poisoned
      prevDepsInConditional.addDepsFromInnerScope(
        this.#depsInCurrentConditional,
        true,
        this.#checkValidDependency.bind(this),
      );
      this.#depsInCurrentConditional = prevDepsInConditional;
    }

    return minInnerScopeDependencies;
  }

  isUsedOutsideDeclaringScope(place: Place): boolean {
    return this.#temporariesUsedOutsideScope.has(
      place.identifier.declarationId,
    );
  }

  /*
   * Prints dependency tree to string for debugging.
   * @param includeAccesses
   * @returns string representation of DependencyTree
   */
  printDeps(includeAccesses: boolean = false): string {
    return this.#dependencies.printDeps(includeAccesses);
  }

  /*
   * We track and return unconditional accesses / deps within this conditional.
   * If an object property is always used (i.e. in every conditional path), we
   * want to promote it to an unconditional access / dependency.
   *
   * The caller of `enterConditional` is responsible determining for promotion.
   * i.e. call promoteDepsFromExhaustiveConditionals to merge returned results.
   *
   * e.g. we want to mark props.a.b as an unconditional dep here
   *   if (foo(...)) {
   *     access(props.a.b);
   *   } else {
   *     access(props.a.b);
   *   }
   */
  enterConditional(fn: () => void): ReactiveScopeDependencyTree {
    const prevInConditional = this.#inConditionalWithinScope;
    const prevUncondAccessed = this.#depsInCurrentConditional;
    this.#inConditionalWithinScope = true;
    this.#depsInCurrentConditional = new ReactiveScopeDependencyTree();
    fn();
    const result = this.#depsInCurrentConditional;
    this.#inConditionalWithinScope = prevInConditional;
    this.#depsInCurrentConditional = prevUncondAccessed;
    return result;
  }

  /*
   * Add dependencies from exhaustive CFG paths into the current ReactiveDeps
   * tree. If a property is used in every CFG path, it is promoted to an
   * unconditional access / dependency here.
   * @param depsInConditionals
   */
  promoteDepsFromExhaustiveConditionals(
    depsInConditionals: Array<ReactiveScopeDependencyTree>,
  ): void {
    this.#dependencies.promoteDepsFromExhaustiveConditionals(
      depsInConditionals,
    );
    this.#depsInCurrentConditional.promoteDepsFromExhaustiveConditionals(
      depsInConditionals,
    );
  }

  /*
   * Records where a value was declared, and optionally, the scope where the value originated from.
   * This is later used to determine if a dependency should be added to a scope; if the current
   * scope we are visiting is the same scope where the value originates, it can't be a dependency
   * on itself.
   */
  declare(identifier: Identifier, decl: Decl): void {
    if (!this.#declarations.has(identifier.declarationId)) {
      this.#declarations.set(identifier.declarationId, decl);
    }
    this.#reassignments.set(identifier, decl);
  }

  declareTemporary(lvalue: Place, place: Place): void {
    this.#temporaries.set(lvalue.identifier, place);
  }

  resolveTemporary(place: Place): Place {
    return this.#temporaries.get(place.identifier) ?? place;
  }

  #getProperty(
    object: Place,
    property: string,
    optional: boolean,
  ): ReactiveScopePropertyDependency {
    const resolvedObject = this.resolveTemporary(object);
    const resolvedDependency = this.#properties.get(resolvedObject.identifier);
    let objectDependency: ReactiveScopePropertyDependency;
    /*
     * (1) Create the base property dependency as either a LoadLocal (from a temporary)
     * or a deep copy of an existing property dependency.
     */
    if (resolvedDependency === undefined) {
      objectDependency = {
        identifier: resolvedObject.identifier,
        path: [],
      };
    } else {
      objectDependency = {
        identifier: resolvedDependency.identifier,
        path: [...resolvedDependency.path],
      };
    }

    objectDependency.path.push({property, optional});

    return objectDependency;
  }

  declareProperty(
    lvalue: Place,
    object: Place,
    property: string,
    optional: boolean,
  ): void {
    const nextDependency = this.#getProperty(object, property, optional);
    this.#properties.set(lvalue.identifier, nextDependency);
  }

  // Checks if identifier is a valid dependency in the current scope
  #checkValidDependency(maybeDependency: ReactiveScopeDependency): boolean {
    // ref.current access is not a valid dep
    if (
      isUseRefType(maybeDependency.identifier) &&
      maybeDependency.path.at(0)?.property === 'current'
    ) {
      return false;
    }

    // ref value is not a valid dep
    if (isRefValueType(maybeDependency.identifier)) {
      return false;
    }

    /*
     * object methods are not deps because they will be codegen'ed back in to
     * the object literal.
     */
    if (isObjectMethodType(maybeDependency.identifier)) {
      return false;
    }

    const identifier = maybeDependency.identifier;
    /*
     * If this operand is used in a scope, has a dynamic value, and was defined
     * before this scope, then its a dependency of the scope.
     */
    const currentDeclaration =
      this.#reassignments.get(identifier) ??
      this.#declarations.get(identifier.declarationId);
    const currentScope = this.currentScope.value?.value;
    return (
      currentScope != null &&
      currentDeclaration !== undefined &&
      currentDeclaration.id < currentScope.range.start &&
      (currentDeclaration.scope == null ||
        currentDeclaration.scope.value?.value !== currentScope)
    );
  }

  #isScopeActive(scope: ReactiveScope): boolean {
    if (this.#scopes === null) {
      return false;
    }
    return this.#scopes.find(state => state.value === scope);
  }

  get currentScope(): Stack<ScopeTraversalState> {
    return this.#scopes;
  }

  get isPoisoned(): boolean {
    return this.poisonState.isPoisoned;
  }

  visitOperand(place: Place): void {
    const resolved = this.resolveTemporary(place);
    /*
     * if this operand is a temporary created for a property load, try to resolve it to
     * the expanded Place. Fall back to using the operand as-is.
     */

    let dependency: ReactiveScopePropertyDependency = {
      identifier: resolved.identifier,
      path: [],
    };
    if (resolved.identifier.name === null) {
      const propertyDependency = this.#properties.get(resolved.identifier);
      if (propertyDependency !== undefined) {
        dependency = {...propertyDependency};
      }
    }
    this.visitDependency(dependency);
  }

  visitProperty(object: Place, property: string, optional: boolean): void {
    const nextDependency = this.#getProperty(object, property, optional);
    this.visitDependency(nextDependency);
  }

  visitDependency(maybeDependency: ReactiveScopePropertyDependency): void {
    /*
     * Any value used after its originally defining scope has concluded must be added as an
     * output of its defining scope. Regardless of whether its a const or not,
     * some later code needs access to the value. If the current
     * scope we are visiting is the same scope where the value originates, it can't be a dependency
     * on itself.
     */

    /*
     * if originalDeclaration is undefined here, then this is a free var
     *  (all other decls e.g. `let x;` should be initialized in BuildHIR)
     */
    const originalDeclaration = this.#declarations.get(
      maybeDependency.identifier.declarationId,
    );
    if (
      originalDeclaration !== undefined &&
      originalDeclaration.scope.value !== null
    ) {
      originalDeclaration.scope.each(scope => {
        if (
          !this.#isScopeActive(scope.value) &&
          // TODO LeaveSSA: key scope.declarations by DeclarationId
          !Iterable_some(
            scope.value.declarations.values(),
            decl =>
              decl.identifier.declarationId ===
              maybeDependency.identifier.declarationId,
          )
        ) {
          scope.value.declarations.set(maybeDependency.identifier.id, {
            identifier: maybeDependency.identifier,
            scope: originalDeclaration.scope.value!.value,
          });
        }
      });
    }

    if (this.#checkValidDependency(maybeDependency)) {
      const isPoisoned = this.isPoisoned;
      this.#depsInCurrentConditional.add(maybeDependency, isPoisoned);
      /*
       * Add info about this dependency to the existing tree
       * We do not try to join/reduce dependencies here due to missing info
       */
      this.#dependencies.add(
        maybeDependency,
        this.#inConditionalWithinScope || isPoisoned,
      );
    }
  }

  /*
   * Record a variable that is declared in some other scope and that is being reassigned in the
   * current one as a {@link ReactiveScope.reassignments}
   */
  visitReassignment(place: Place): void {
    const currentScope = this.currentScope.value?.value;
    if (
      currentScope != null &&
      !Iterable_some(
        currentScope.reassignments,
        identifier =>
          identifier.declarationId === place.identifier.declarationId,
      ) &&
      this.#checkValidDependency({identifier: place.identifier, path: []})
    ) {
      // TODO LeaveSSA: scope.reassignments should be keyed by declarationid
      currentScope.reassignments.add(place.identifier);
    }
  }

  pushLabeledBlock(id: BlockId): void {
    const currentScope = this.#scopes.value;
    if (currentScope != null) {
      currentScope.ownBlocks = currentScope.ownBlocks.push(id);
    }
  }
  popLabeledBlock(id: BlockId): void {
    const currentScope = this.#scopes.value;
    if (currentScope != null) {
      const last = currentScope.ownBlocks.value;
      currentScope.ownBlocks = currentScope.ownBlocks.pop();

      CompilerError.invariant(last != null && last === id, {
        reason: '[PropagateScopeDependencies] Misformed block stack',
        loc: GeneratedSource,
      });
    }
    this.poisonState.removeMaybePoisonedBlock(id, currentScope);
  }
}

class PropagationVisitor extends ReactiveFunctionVisitor<Context> {
  env: Environment;

  constructor(env: Environment) {
    super();
    this.env = env;
  }

  override visitScope(scope: ReactiveScopeBlock, context: Context): void {
    const scopeDependencies = context.enter(scope.scope, () => {
      this.visitBlock(scope.instructions, context);
    });
    for (const candidateDep of scopeDependencies) {
      if (
        !Iterable_some(
          scope.scope.dependencies,
          existingDep =>
            existingDep.identifier.declarationId ===
              candidateDep.identifier.declarationId &&
            areEqualPaths(existingDep.path, candidateDep.path),
        )
      ) {
        scope.scope.dependencies.add(candidateDep);
      }
    }
    /*
     * TODO LeaveSSA: fix existing bug with duplicate deps and reassignments
     * see fixture ssa-cascading-eliminated-phis, note that we cache `x`
     * twice because its both a dep and a reassignment.
     *
     * for (const reassignment of scope.scope.reassignments) {
     *   if (
     *     Iterable_some(
     *       scope.scope.dependencies.values(),
     *       dep =>
     *         dep.identifier.declarationId === reassignment.declarationId &&
     *         dep.path.length === 0,
     *     )
     *   ) {
     *     scope.scope.reassignments.delete(reassignment);
     *   }
     * }
     */
  }

  override visitPrunedScope(
    scopeBlock: PrunedReactiveScopeBlock,
    context: Context,
  ): void {
    /*
     * NOTE: we explicitly throw away the deps, we only enter() the scope to record its
     * declarations
     */
    const _scopeDepdencies = context.enter(scopeBlock.scope, () => {
      this.visitBlock(scopeBlock.instructions, context);
    });
  }

  override visitInstruction(
    instruction: ReactiveInstruction,
    context: Context,
  ): void {
    const {id, value, lvalue} = instruction;
    this.visitInstructionValue(context, id, value, lvalue);
    if (lvalue == null) {
      return;
    }
    context.declare(lvalue.identifier, {
      id,
      scope: context.currentScope,
    });
  }

  extractOptionalProperty(
    context: Context,
    optionalValue: ReactiveOptionalCallValue,
    lvalue: Place,
  ): {
    lvalue: Place;
    object: Place;
    property: string;
    optional: boolean;
  } | null {
    const sequence = optionalValue.value;
    CompilerError.invariant(sequence.kind === 'SequenceExpression', {
      reason: 'Expected OptionalExpression value to be a SequenceExpression',
      description: `Found a \`${sequence.kind}\``,
      loc: sequence.loc,
    });
    /**
     * Base case: inner `<variable> "?." <property>`
     *```
     * <lvalue> = OptionalExpression optional=true (`optionalValue` is here)
     *  Sequence (`sequence` is here)
     *    t0 = LoadLocal <variable>
     *    Sequence
     *      t1 = PropertyLoad t0 . <property>
     *      LoadLocal t1
     * ```
     */
    if (
      sequence.instructions.length === 1 &&
      sequence.instructions[0].lvalue !== null &&
      sequence.instructions[0].value.kind === 'LoadLocal' &&
      sequence.instructions[0].value.place.identifier.name !== null &&
      !context.isUsedOutsideDeclaringScope(sequence.instructions[0].lvalue) &&
      sequence.value.kind === 'SequenceExpression' &&
      sequence.value.instructions.length === 1 &&
      sequence.value.instructions[0].value.kind === 'PropertyLoad' &&
      sequence.value.instructions[0].value.object.identifier.id ===
        sequence.instructions[0].lvalue.identifier.id &&
      sequence.value.instructions[0].lvalue !== null &&
      sequence.value.value.kind === 'LoadLocal' &&
      sequence.value.value.place.identifier.id ===
        sequence.value.instructions[0].lvalue.identifier.id
    ) {
      context.declareTemporary(
        sequence.instructions[0].lvalue,
        sequence.instructions[0].value.place,
      );
      const propertyLoad = sequence.value.instructions[0].value;
      return {
        lvalue,
        object: propertyLoad.object,
        property: propertyLoad.property,
        optional: optionalValue.optional,
      };
    }
    /**
     * Base case 2: inner `<variable> "." <property1> "?." <property2>
     * ```
     * <lvalue> = OptionalExpression optional=true (`optionalValue` is here)
     *  Sequence (`sequence` is here)
     *    t0 = Sequence
     *      t1 = LoadLocal <variable>
     *      ... // see note
     *      PropertyLoad t1 . <property1>
     *    [46] Sequence
     *      t2 = PropertyLoad t0 . <property2>
     *      [46] LoadLocal t2
     * ```
     *
     * Note that it's possible to have additional inner chained non-optional
     * property loads at "...", from an expression like `a?.b.c.d.e`. We could
     * expand to support this case by relaxing the check on the inner sequence
     * length, ensuring all instructions after the first LoadLocal are PropertyLoad
     * and then iterating to ensure that the lvalue of the previous is always
     * the object of the next PropertyLoad, w the final lvalue as the object
     * of the sequence.value's object.
     *
     * But this case is likely rare in practice, usually once you're optional
     * chaining all property accesses are optional (not `a?.b.c` but `a?.b?.c`).
     * Also, HIR-based PropagateScopeDeps will handle this case so it doesn't
     * seem worth it to optimize for that edge-case here.
     */
    if (
      sequence.instructions.length === 1 &&
      sequence.instructions[0].lvalue !== null &&
      sequence.instructions[0].value.kind === 'SequenceExpression' &&
      sequence.instructions[0].value.instructions.length === 1 &&
      sequence.instructions[0].value.instructions[0].lvalue !== null &&
      sequence.instructions[0].value.instructions[0].value.kind ===
        'LoadLocal' &&
      sequence.instructions[0].value.instructions[0].value.place.identifier
        .name !== null &&
      !context.isUsedOutsideDeclaringScope(
        sequence.instructions[0].value.instructions[0].lvalue,
      ) &&
      sequence.instructions[0].value.value.kind === 'PropertyLoad' &&
      sequence.instructions[0].value.value.object.identifier.id ===
        sequence.instructions[0].value.instructions[0].lvalue.identifier.id &&
      sequence.value.kind === 'SequenceExpression' &&
      sequence.value.instructions.length === 1 &&
      sequence.value.instructions[0].lvalue !== null &&
      sequence.value.instructions[0].value.kind === 'PropertyLoad' &&
      sequence.value.instructions[0].value.object.identifier.id ===
        sequence.instructions[0].lvalue.identifier.id &&
      sequence.value.value.kind === 'LoadLocal' &&
      sequence.value.value.place.identifier.id ===
        sequence.value.instructions[0].lvalue.identifier.id
    ) {
      // LoadLocal <variable>
      context.declareTemporary(
        sequence.instructions[0].value.instructions[0].lvalue,
        sequence.instructions[0].value.instructions[0].value.place,
      );
      // PropertyLoad <variable> . <property1> (the inner non-optional property)
      context.declareProperty(
        sequence.instructions[0].lvalue,
        sequence.instructions[0].value.value.object,
        sequence.instructions[0].value.value.property,
        false,
      );
      const propertyLoad = sequence.value.instructions[0].value;
      return {
        lvalue,
        object: propertyLoad.object,
        property: propertyLoad.property,
        optional: optionalValue.optional,
      };
    }

    /**
     * Composed case:
     * - `<base-case>      "." or "?."  <property>`
     * - `<composed-case>  "." or "?>"  <property>`
     *
     * This case is convoluted, note how `t0` appears as an lvalue *twice*
     * and then is an operand of an intermediate LoadLocal and then the
     * object of the final PropertyLoad:
     *
     * ```
     * <lvalue> = OptionalExpression optional=false (`optionalValue` is here)
     *  Sequence (`sequence` is here)
     *      t0 = Sequence
     *        t0 =
     *           <nested>
     *        LoadLocal t0
     *      Sequence
     *        t1 = PropertyLoad t0. <property>
     *        LoadLocal t1
     * ```
     */
    if (
      sequence.instructions.length === 1 &&
      sequence.instructions[0].value.kind === 'SequenceExpression' &&
      sequence.instructions[0].value.instructions.length === 1 &&
      sequence.instructions[0].value.instructions[0].lvalue !== null &&
      sequence.instructions[0].value.instructions[0].value.kind ===
        'OptionalExpression' &&
      sequence.instructions[0].value.value.kind === 'LoadLocal' &&
      sequence.instructions[0].value.value.place.identifier.id ===
        sequence.instructions[0].value.instructions[0].lvalue.identifier.id &&
      sequence.value.kind === 'SequenceExpression' &&
      sequence.value.instructions.length === 1 &&
      sequence.value.instructions[0].lvalue !== null &&
      sequence.value.instructions[0].value.kind === 'PropertyLoad' &&
      sequence.value.instructions[0].value.object.identifier.id ===
        sequence.instructions[0].value.value.place.identifier.id &&
      sequence.value.value.kind === 'LoadLocal' &&
      sequence.value.value.place.identifier.id ===
        sequence.value.instructions[0].lvalue.identifier.id
    ) {
      const {lvalue: innerLvalue, value: innerOptional} =
        sequence.instructions[0].value.instructions[0];
      const innerProperty = this.extractOptionalProperty(
        context,
        innerOptional,
        innerLvalue,
      );
      if (innerProperty === null) {
        return null;
      }
      context.declareProperty(
        innerProperty.lvalue,
        innerProperty.object,
        innerProperty.property,
        innerProperty.optional,
      );
      const propertyLoad = sequence.value.instructions[0].value;
      return {
        lvalue,
        object: propertyLoad.object,
        property: propertyLoad.property,
        optional: optionalValue.optional,
      };
    }
    return null;
  }

  visitOptionalExpression(
    context: Context,
    id: InstructionId,
    value: ReactiveOptionalCallValue,
    lvalue: Place | null,
  ): void {
    /**
     * If this is the first optional=true optional in a recursive OptionalExpression
     * subtree, we check to see if the subtree is of the form:
     * ```
     * NestedOptional =
     *   `<variable> . / ?. <property>`
     *   `<nested-optional> . / ?. <property>`
     * ```
     *
     * Ie strictly a chain like `foo?.bar?.baz` or `a?.b.c`. If the subtree contains
     * any other types of expressions - for example `foo?.[makeKey(a)]` - then this
     * will return null and we'll go to the default handling below.
     *
     * If the tree does match the NestedOptional shape, then we'll have recorded
     * a sequence of declareProperty calls, and the final visitProperty call here
     * will record that optional chain as a dependency (since we know it's about
     * to be referenced via its lvalue which is non-null).
     */
    if (
      lvalue !== null &&
      value.optional &&
      this.env.config.enableOptionalDependencies
    ) {
      const inner = this.extractOptionalProperty(context, value, lvalue);
      if (inner !== null) {
        context.visitProperty(inner.object, inner.property, inner.optional);
        return;
      }
    }

    // Otherwise we treat everything after the optional as conditional
    const inner = value.value;
    /*
     * OptionalExpression value is a SequenceExpression where the instructions
     * represent the code prior to the `?` and the final value represents the
     * conditional code that follows.
     */
    CompilerError.invariant(inner.kind === 'SequenceExpression', {
      reason: 'Expected OptionalExpression value to be a SequenceExpression',
      description: `Found a \`${value.kind}\``,
      loc: value.loc,
      suggestions: null,
    });
    // Instructions are the unconditionally executed portion before the `?`
    for (const instr of inner.instructions) {
      this.visitInstruction(instr, context);
    }
    // The final value is the conditional portion following the `?`
    context.enterConditional(() => {
      this.visitReactiveValue(context, id, inner.value, null);
    });
  }

  visitReactiveValue(
    context: Context,
    id: InstructionId,
    value: ReactiveValue,
    lvalue: Place | null,
  ): void {
    switch (value.kind) {
      case 'OptionalExpression': {
        this.visitOptionalExpression(context, id, value, lvalue);
        break;
      }
      case 'LogicalExpression': {
        this.visitReactiveValue(context, id, value.left, null);
        context.enterConditional(() => {
          this.visitReactiveValue(context, id, value.right, null);
        });
        break;
      }
      case 'ConditionalExpression': {
        this.visitReactiveValue(context, id, value.test, null);

        const consequentDeps = context.enterConditional(() => {
          this.visitReactiveValue(context, id, value.consequent, null);
        });
        const alternateDeps = context.enterConditional(() => {
          this.visitReactiveValue(context, id, value.alternate, null);
        });
        context.promoteDepsFromExhaustiveConditionals([
          consequentDeps,
          alternateDeps,
        ]);
        break;
      }
      case 'SequenceExpression': {
        for (const instr of value.instructions) {
          this.visitInstruction(instr, context);
        }
        this.visitInstructionValue(context, id, value.value, null);
        break;
      }
      case 'FunctionExpression': {
        if (this.env.config.enableTreatFunctionDepsAsConditional) {
          context.enterConditional(() => {
            for (const operand of eachInstructionValueOperand(value)) {
              context.visitOperand(operand);
            }
          });
        } else {
          for (const operand of eachInstructionValueOperand(value)) {
            context.visitOperand(operand);
          }
        }
        break;
      }
      case 'ReactiveFunctionValue': {
        CompilerError.invariant(false, {
          reason: `Unexpected ReactiveFunctionValue`,
          loc: value.loc,
          description: null,
          suggestions: null,
        });
      }
      default: {
        for (const operand of eachInstructionValueOperand(value)) {
          context.visitOperand(operand);
        }
      }
    }
  }

  visitInstructionValue(
    context: Context,
    id: InstructionId,
    value: ReactiveValue,
    lvalue: Place | null,
  ): void {
    if (value.kind === 'LoadLocal' && lvalue !== null) {
      if (
        value.place.identifier.name !== null &&
        lvalue.identifier.name === null &&
        !context.isUsedOutsideDeclaringScope(lvalue)
      ) {
        context.declareTemporary(lvalue, value.place);
      } else {
        context.visitOperand(value.place);
      }
    } else if (value.kind === 'PropertyLoad') {
      if (lvalue !== null && !context.isUsedOutsideDeclaringScope(lvalue)) {
        context.declareProperty(lvalue, value.object, value.property, false);
      } else {
        context.visitProperty(value.object, value.property, false);
      }
    } else if (value.kind === 'StoreLocal') {
      context.visitOperand(value.value);
      if (value.lvalue.kind === InstructionKind.Reassign) {
        context.visitReassignment(value.lvalue.place);
      }
      context.declare(value.lvalue.place.identifier, {
        id,
        scope: context.currentScope,
      });
    } else if (
      value.kind === 'DeclareLocal' ||
      value.kind === 'DeclareContext'
    ) {
      /*
       * Some variables may be declared and never initialized. We need
       * to retain (and hoist) these declarations if they are included
       * in a reactive scope. One approach is to simply add all `DeclareLocal`s
       * as scope declarations.
       */

      /*
       * We add context variable declarations here, not at `StoreContext`, since
       * context Store / Loads are modeled as reads and mutates to the underlying
       * variable reference (instead of through intermediate / inlined temporaries)
       */
      context.declare(value.lvalue.place.identifier, {
        id,
        scope: context.currentScope,
      });
    } else if (value.kind === 'Destructure') {
      context.visitOperand(value.value);
      for (const place of eachPatternOperand(value.lvalue.pattern)) {
        if (value.lvalue.kind === InstructionKind.Reassign) {
          context.visitReassignment(place);
        }
        context.declare(place.identifier, {
          id,
          scope: context.currentScope,
        });
      }
    } else {
      this.visitReactiveValue(context, id, value, lvalue);
    }
  }

  enterTerminal(stmt: ReactiveTerminalStatement, context: Context): void {
    if (stmt.label != null) {
      context.pushLabeledBlock(stmt.label.id);
    }
    const terminal = stmt.terminal;
    switch (terminal.kind) {
      case 'continue':
      case 'break': {
        context.poisonState.addPoisonTarget(
          terminal.target,
          context.currentScope,
        );
        break;
      }
      case 'throw':
      case 'return': {
        context.poisonState.addPoisonTarget(null, context.currentScope);
        break;
      }
    }
  }
  exitTerminal(stmt: ReactiveTerminalStatement, context: Context): void {
    if (stmt.label != null) {
      context.popLabeledBlock(stmt.label.id);
    }
  }

  override visitTerminal(
    stmt: ReactiveTerminalStatement,
    context: Context,
  ): void {
    this.enterTerminal(stmt, context);
    const terminal = stmt.terminal;
    switch (terminal.kind) {
      case 'break':
      case 'continue': {
        break;
      }
      case 'return': {
        context.visitOperand(terminal.value);
        break;
      }
      case 'throw': {
        context.visitOperand(terminal.value);
        break;
      }
      case 'for': {
        this.visitReactiveValue(context, terminal.id, terminal.init, null);
        this.visitReactiveValue(context, terminal.id, terminal.test, null);
        context.enterConditional(() => {
          this.visitBlock(terminal.loop, context);
          if (terminal.update !== null) {
            this.visitReactiveValue(
              context,
              terminal.id,
              terminal.update,
              null,
            );
          }
        });
        break;
      }
      case 'for-of': {
        this.visitReactiveValue(context, terminal.id, terminal.init, null);
        context.enterConditional(() => {
          this.visitBlock(terminal.loop, context);
        });
        break;
      }
      case 'for-in': {
        this.visitReactiveValue(context, terminal.id, terminal.init, null);
        context.enterConditional(() => {
          this.visitBlock(terminal.loop, context);
        });
        break;
      }
      case 'do-while': {
        this.visitBlock(terminal.loop, context);
        context.enterConditional(() => {
          this.visitReactiveValue(context, terminal.id, terminal.test, null);
        });
        break;
      }
      case 'while': {
        this.visitReactiveValue(context, terminal.id, terminal.test, null);
        context.enterConditional(() => {
          this.visitBlock(terminal.loop, context);
        });
        break;
      }
      case 'if': {
        context.visitOperand(terminal.test);
        const {consequent, alternate} = terminal;
        /*
         * Consequent and alternate branches are mutually exclusive,
         * so we save and restore the poison state here.
         */
        const prevPoisonState = context.poisonState.clone();
        const depsInIf = context.enterConditional(() => {
          this.visitBlock(consequent, context);
        });
        if (alternate !== null) {
          const ifPoisonState = context.poisonState.take(prevPoisonState);
          const depsInElse = context.enterConditional(() => {
            this.visitBlock(alternate, context);
          });
          context.poisonState.merge(
            [ifPoisonState],
            context.currentScope.value,
          );
          context.promoteDepsFromExhaustiveConditionals([depsInIf, depsInElse]);
        }
        break;
      }
      case 'switch': {
        context.visitOperand(terminal.test);
        const isDefaultOnly =
          terminal.cases.length === 1 && terminal.cases[0].test == null;
        if (isDefaultOnly) {
          const case_ = terminal.cases[0];
          if (case_.block != null) {
            this.visitBlock(case_.block, context);
            break;
          }
        }
        const depsInCases = [];
        let foundDefault = false;
        /**
         * Switch branches are mutually exclusive
         */
        const prevPoisonState = context.poisonState.clone();
        const mutExPoisonStates: Array<PoisonState> = [];
        /*
         * This can underestimate unconditional accesses due to the current
         * CFG representation for fallthrough. This is safe. It only
         * reduces granularity of dependencies.
         */
        for (const {test, block} of terminal.cases) {
          if (test !== null) {
            context.visitOperand(test);
          } else {
            foundDefault = true;
          }
          if (block !== undefined) {
            mutExPoisonStates.push(
              context.poisonState.take(prevPoisonState.clone()),
            );
            depsInCases.push(
              context.enterConditional(() => {
                this.visitBlock(block, context);
              }),
            );
          }
        }
        if (foundDefault) {
          context.promoteDepsFromExhaustiveConditionals(depsInCases);
        }
        context.poisonState.merge(
          mutExPoisonStates,
          context.currentScope.value,
        );
        break;
      }
      case 'label': {
        this.visitBlock(terminal.block, context);
        break;
      }
      case 'try': {
        this.visitBlock(terminal.block, context);
        this.visitBlock(terminal.handler, context);
        break;
      }
      default: {
        assertExhaustive(
          terminal,
          `Unexpected terminal kind \`${(terminal as any).kind}\``,
        );
      }
    }
    this.exitTerminal(stmt, context);
  }
}
