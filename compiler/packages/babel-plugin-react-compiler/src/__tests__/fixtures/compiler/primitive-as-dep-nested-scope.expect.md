
## Input

```javascript
// props.b + 1 is an non-allocating expression, which means Forget can
// emit it trivially and repeatedly (e.g. no need to memoize props.b + 1
// separately from props.b)
// Correctness:
//   y depends on either props.b or props.b + 1
function PrimitiveAsDepNested(props) {
  let x = {};
  mutate(x);
  let y = foo(props.b + 1);
  mutate(x, props.a);
  return [x, y];
}

```

## Code

```javascript
import { c as _c } from "react/compiler-runtime"; // props.b + 1 is an non-allocating expression, which means Forget can
// emit it trivially and repeatedly (e.g. no need to memoize props.b + 1
// separately from props.b)
// Correctness:
//   y depends on either props.b or props.b + 1
function PrimitiveAsDepNested(props) {
  const $ = _c(9);
  let x;
  let y;
  if ($[0] !== props.b || $[1] !== props.a) {
    x = {};
    mutate(x);
    const t0 = props.b + 1;
    let t1;
    if ($[4] !== t0) {
      t1 = foo(t0);
      $[4] = t0;
      $[5] = t1;
    } else {
      t1 = $[5];
    }
    y = t1;
    mutate(x, props.a);
    $[0] = props.b;
    $[1] = props.a;
    $[2] = x;
    $[3] = y;
  } else {
    x = $[2];
    y = $[3];
  }
  let t0;
  if ($[6] !== x || $[7] !== y) {
    t0 = [x, y];
    $[6] = x;
    $[7] = y;
    $[8] = t0;
  } else {
    t0 = $[8];
  }
  return t0;
}

```
      