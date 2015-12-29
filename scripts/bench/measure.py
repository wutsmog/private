#!/usr/bin/env python
# Copyright 2015-present, Facebook, Inc.
# All rights reserved.
#
# This source code is licensed under the BSD-style license found in the
# LICENSE file in the root directory of this source tree. An additional grant
# of patent rights can be found in the PATENTS file in the same directory.

import functools
import json
import os
import subprocess
import sys


def _run_js_in_jsc(jit, js, env):
    return subprocess.check_call(
        ['jsc', '-e', """
            function now() {
                return preciseTime() * 1000;
            }
            function globalEval(code) {
                (0, eval)(code);
            }
            function report(label, time) {
                print(label + '_' + %(engine)s, time);
            }

            this.ENV = %(env)s;
            %(js)s
        """ % {
            'env': json.dumps(env),
            'js': js,
            'engine': json.dumps('jsc_' + ('jit' if jit else 'nojit')),
        }],
        env=dict(os.environ, JSC_useJIT='yes' if jit else 'no'),
    )

_run_js_in_jsc_jit = functools.partial(_run_js_in_jsc, True)
_run_js_in_jsc_nojit = functools.partial(_run_js_in_jsc, False)


def _run_js_in_node(js, env):
    return subprocess.check_call(
        ['node', '-e', """
            function now() {
                var hrTime = process.hrtime();
                return hrTime[0] * 1e3 + hrTime[1] * 1e-6;
            }
            function globalEval(code) {
                var vm = require('vm');
                // Hide "module" so UMD wrappers use the global
                vm.runInThisContext('(function(module){' + code + '\\n})()');
            }
            function readFile(filename) {
                var fs = require('fs');
                return fs.readFileSync(filename);
            }
            function report(label, time) {
                console.log(label + '_node', time);
            }

            global.ENV = %(env)s;
            %(js)s
        """ % {
            'env': json.dumps(env),
            'js': js
        }]
    )


def _measure_ssr_ms(engine, react_path, bench_name, bench_path, measure_warm):
    engine(
        """
            var reactCode = readFile(ENV.react_path);
            var START = now();
            globalEval(reactCode);
            var END = now();
            if (typeof React !== 'object') throw new Error('React not laoded');
            report('factory_ms', END - START);

            globalEval(readFile(ENV.bench_path));
            if (typeof Benchmark !== 'function') {
              throw new Error('benchmark not loaded');
            }
            var START = now();
            var html = React.renderToString(React.createElement(Benchmark));
            html.charCodeAt(0);  // flatten ropes
            var END = now();
            report('ssr_' + ENV.bench_name + '_cold_ms', END - START);

            var warmup = ENV.measure_warm ? 80 : 0;
            var trials = ENV.measure_warm ? 40 : 0;

            for (var i = 0; i < warmup; i++) {
                React.renderToString(React.createElement(Benchmark));
            }

            for (var i = 0; i < trials; i++) {
                var START = now();
                var html = React.renderToString(React.createElement(Benchmark));
                html.charCodeAt(0);  // flatten ropes
                var END = now();
                report('ssr_' + ENV.bench_name + '_warm_ms', END - START);
            }
        """,
        {
            'bench_name': bench_name,
            'bench_path': bench_path,
            'measure_warm': measure_warm,
            'react_path': react_path,
        },
    )


def _main():
    if len(sys.argv) != 2:
        sys.stderr.write("usage: measure.py react.min.js >out.txt\n")
        return 1
    react_path = sys.argv[1]

    trials = 30
    sys.stderr.write("Measuring SSR for PE benchmark (%d trials)\n" % trials)
    for i in range(trials):
        for engine in [
            _run_js_in_jsc_jit,
            _run_js_in_jsc_nojit,
            _run_js_in_node
        ]:
            _measure_ssr_ms(engine, react_path, 'pe', 'bench-pe-es5.js', False)
        sys.stderr.write(".")
        sys.stderr.flush()
    sys.stderr.write("\n")

    trials = 3
    sys.stderr.write("Measuring SSR for PE with warm JIT (%d slow trials)\n" % trials)
    for i in range(trials):
        for engine in [
            _run_js_in_jsc_jit,
            _run_js_in_jsc_nojit,
            _run_js_in_node
        ]:
            _measure_ssr_ms(engine, react_path, 'pe', 'bench-pe-es5.js', True)
        sys.stderr.write(".")
        sys.stderr.flush()
    sys.stderr.write("\n")


if __name__ == '__main__':
    sys.exit(_main())

