import { ProjectGraph } from '@tsnx/core';
import { TsdkContext } from '../discovery.js';

export function runGraph(context: TsdkContext): number {
  let graph: ProjectGraph;

  if (context.kind === 'workspace') {
    console.log(`\nWorkspace Project Graph: "${context.workspace.name}"\n`);
    graph = ProjectGraph.fromWorkspace(context.workspace);
  } else if (context.parentWorkspace) {
    console.log(`\nProject Dependency Graph: "${context.project.name}" (in workspace "${context.parentWorkspace.name}")\n`);
    graph = ProjectGraph.fromWorkspace(context.parentWorkspace);
  } else {
    console.log(`\nProject Dependency Graph: "${context.project.name}"\n`);
    graph = ProjectGraph.fromProject(context.project);
  }

  const buildOrder = graph.getBuildOrder();

  console.log('Topological Build Order (DAG):');
  buildOrder.forEach((p, idx) => {
    console.log(`  ${idx + 1}. ${p.name} (${p.type})`);
  });

  console.log('\nDependency Details:');
  console.log('--------------------------------------------------------------------------------');

  for (const [, node] of graph.nodes) {
    const projName = node.project.name;
    const deps = node.dependencies.map((d) => d.name);
    const dependents = node.dependents.map((d) => d.name);

    console.log(`Project: ${projName}`);
    console.log(`  Dependencies: ${deps.length > 0 ? deps.join(', ') : '(none)'}`);
    console.log(`  Dependents:   ${dependents.length > 0 ? dependents.join(', ') : '(none)'}`);
  }
  console.log('--------------------------------------------------------------------------------\n');

  return 0;
}
