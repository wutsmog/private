import fbt from "fbt";

const _ = fbt;
function Component({ value }: { value: string }) {
  return (
    <fbt desc="descdesc">
      Before text <fbt:param name="paramName">{value}</fbt:param> after text
      more text and more and more and more and more and more and more and more
      and more and blah blah blah blah
    </fbt>
  );
}

export const FIXTURE_ENTRYPOINT = {
  fn: Component,
  params: [{ value: "hello world" }],
};
