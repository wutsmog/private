// @debug
function Component(props) {
  let a = props.x;
  let b;
  let c;
  let d;
  if (props.cond) {
    d = ((b = a), a++, (c = a), ++a);
  }
  return [a, b, c, d];
}
