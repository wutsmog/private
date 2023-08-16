use std::env;
use std::fmt::Write;

use forget_build_hir::build;
use forget_estree::{ModuleItem, Statement};
use forget_hermes_parser::parse;
use forget_hir::{inline_use_memo, Environment, Features, Print, Registry};
use forget_optimization::constant_propagation;
use forget_semantic_analysis::analyze;
use forget_ssa::{eliminate_redundant_phis, enter_ssa};
use insta::{assert_snapshot, glob};
use miette::{NamedSource, Report};

#[test]
fn fixtures() {
    glob!("fixtures/**.js", |path| {
        println!("fixture {}", path.to_str().unwrap());
        let input = std::fs::read_to_string(path).unwrap();
        let ast = parse(&input, path.to_str().unwrap()).unwrap();
        println!("ok parse");

        let mut output = String::new();

        let mut analysis = analyze(&ast, Default::default());
        let diagnostics = analysis.diagnostics();
        if !diagnostics.is_empty() {
            for diagnostic in diagnostics {
                eprintln!(
                    "{:?}",
                    Report::new(diagnostic)
                        .with_source_code(NamedSource::new(path.to_string_lossy(), input.clone(),))
                );
            }
        }
        let environment = Environment::new(
            Features {
                validate_frozen_lambdas: true,
            },
            Registry,
            analysis,
        );
        for (ix, item) in ast.body.iter().enumerate() {
            if let ModuleItem::Statement(stmt) = item {
                if let Statement::FunctionDeclaration(fun) = stmt {
                    if ix != 0 {
                        output.push_str("\n\n");
                    }
                    match build(&environment, &fun.function) {
                        Ok(mut fun) => {
                            println!("ok build");
                            enter_ssa(&environment, &mut fun).unwrap();
                            println!("ok enter_ssa");
                            eliminate_redundant_phis(&environment, &mut fun);
                            println!("ok eliminate_redundant_phis");
                            constant_propagation(&environment, &mut fun).unwrap();
                            println!("ok constant_propagation");
                            inline_use_memo(&environment, &mut fun).unwrap();
                            println!("ok inline_use_memo");
                            fun.print(&fun.body, &mut output).unwrap();
                            println!("ok print");
                        }
                        Err(error) => {
                            write!(&mut output, "{}", error,).unwrap();
                            eprintln!(
                                "{:?}",
                                Report::new(error).with_source_code(NamedSource::new(
                                    path.to_string_lossy(),
                                    input.clone(),
                                ))
                            );
                            continue;
                        }
                    };
                }
            }
        }

        let output = output.trim();
        assert_snapshot!(format!("Input:\n{input}\n\nOutput:\n{output}"));
    });
}
