// @skip

// Valid -- this is a regression test.
jest.useFakeTimers();
beforeEach(() => {
  jest.useRealTimers();
});
