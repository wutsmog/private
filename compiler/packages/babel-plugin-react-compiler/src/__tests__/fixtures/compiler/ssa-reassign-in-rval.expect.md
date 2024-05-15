
## Input

```javascript
// Forget should call the original x (x = foo()) to compute result
function Component() {
  let x = foo();
  let result = x((x = bar()), 5);
  return [result, x];
}

```

## Code

```javascript
import { c as _c } from "react/compiler-runtime"; // Forget should call the original x (x = foo()) to compute result
function Component() {
  const $ = _c(3);
  let t0;
  let x;
  if ($[0] === Symbol.for("react.memo_cache_sentinel")) {
    x = foo();
    t0 = x((x = bar()), 5);
    $[0] = t0;
    $[1] = x;
  } else {
    t0 = $[0];
    x = $[1];
  }
  const result = t0;
  let t1;
  if ($[2] === Symbol.for("react.memo_cache_sentinel")) {
    t1 = [result, x];
    $[2] = t1;
  } else {
    t1 = $[2];
  }
  return t1;
}

```
      