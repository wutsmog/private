function Component(props) {
  let x = 0;
  for (let i = 0; i < props.count; ) {
    x += i;
    if (x > 10) {
      break;
    }
  }
  return x;
}
