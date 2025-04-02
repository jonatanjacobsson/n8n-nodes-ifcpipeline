const path = require('path');
const { task, src, dest } = require('gulp');

task('build:icons', copyIcons);

function copyIcons() {
	const nodeSource = path.resolve('nodes', '**', '*.{png,svg}');
	const nodeDestination = path.resolve('dist', 'nodes');
	const customIconsDestination = path.resolve('dist', 'icons', 'CUSTOM');

	// Copy to nodes directory
	src(nodeSource).pipe(dest(nodeDestination));
	// Copy to icons/CUSTOM directory
	src(nodeSource).pipe(dest(customIconsDestination));

	const credSource = path.resolve('credentials', '**', '*.{png,svg}');
	const credDestination = path.resolve('dist', 'credentials');

	return src(credSource).pipe(dest(credDestination));
}
