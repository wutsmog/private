// @flow

import React, { useDebugValue, useState } from 'react';

const div = document.createElement('div');
const exmapleFunction = () => {};
const typedArray = new Uint8Array(3);
typedArray[0] = 1;
typedArray[1] = 2;
typedArray[2] = 3;

const arrayOfArrays = [
  [['a', 'b', 'c'], ['d', 'e', 'f'], ['h', 'i', 'j']],
  [['k', 'l', 'm'], ['n', 'o', 'p'], ['q', 'r', 's']],
  [['t', 'u', 'v'], ['w', 'x', 'y'], ['z']],
  [],
];

const objectOfObjects = {
  foo: {
    a: 1,
    b: 2,
    c: 3,
  },
  bar: {
    e: 4,
    f: 5,
    g: 6,
  },
  baz: {
    h: 7,
    i: 8,
    j: 9,
  },
  qux: {},
};

function useOuterFoo() {
  useDebugValue({
    debugA: {
      debugB: {
        debugC: 'abc',
      },
    },
  });
  useState({
    valueA: {
      valueB: {
        valueC: 'abc',
      },
    },
  });
  return useInnerFoo();
}

function useInnerFoo() {
  const [value] = useState([[['a', 'b', 'c']]]);
  return value;
}

function useOuterBar() {
  useDebugValue({
    debugA: {
      debugB: {
        debugC: 'abc',
      },
    },
  });
  return useInnerBar();
}

function useInnerBar() {
  useDebugValue({
    debugA: {
      debugB: {
        debugC: 'abc',
      },
    },
  });
  const [count] = useState(123);
  return count;
}

function useOuterBaz() {
  return useInnerBaz();
}

function useInnerBaz() {
  const [count] = useState(123);
  return count;
}

export default function Hydration() {
  return (
    <ChildComponent
      html_element={div}
      fn={exmapleFunction}
      symbol={Symbol('symbol')}
      react_element={<span />}
      array_buffer={typedArray.buffer}
      typed_array={typedArray}
      date={new Date()}
      array={arrayOfArrays}
      object={objectOfObjects}
    />
  );
}

function ChildComponent(props: any) {
  useOuterFoo();
  useOuterBar();
  useOuterBaz();
  return null;
}
