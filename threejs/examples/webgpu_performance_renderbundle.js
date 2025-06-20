// https://github.com/mrdoob/three.js/blob/r175/examples/webgpu_performance_renderbundle.html

		import * as THREE from 'three';

		import Stats from 'stats-gl';

		import { GUI } from 'three/addons/libs/lil-gui.module.min.js';

		import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

/* POLYFILL */
import * as polyfill from "../polyfill/polyfill.ts";
await polyfill.init("three.js webgpu - renderbundle");

		let camera, scene, renderer;
		let controls, stats;
		let gui;
		let geometries, group;

		let renderTimeAverages = [];
		//

		const position = new THREE.Vector3();
		const rotation = new THREE.Euler();
		const quaternion = new THREE.Quaternion();
		const scale = new THREE.Vector3();

		//

		const MAX_GEOMETRY_COUNT = 4000;

		const api = {
webgpu: true,
renderBundle: true,
count: MAX_GEOMETRY_COUNT,
opacity: 1,
dynamic: false
		};


		init( ! api.webgpu );

		//

		function randomizeMatrix( matrix ) {

position.x = Math.random() * 80 - 40;
position.y = Math.random() * 80 - 40;
position.z = Math.random() * 80 - 40;

rotation.x = Math.random() * 2 * Math.PI;
rotation.y = Math.random() * 2 * Math.PI;
rotation.z = Math.random() * 2 * Math.PI;

quaternion.setFromEuler( rotation );

const factorScale = api.webgpu ? 1 : 2.0;
scale.x = scale.y = scale.z = 0.35 * factorScale + ( Math.random() * 0.5 * factorScale );

return matrix.compose( position, quaternion, scale );

		}

		function randomizeRotationSpeed( rotation ) {

rotation.x = Math.random() * .05;
rotation.y = Math.random() * .05;
rotation.z = Math.random() * .05;
return rotation;

		}

		function initGeometries() {

geometries = [
	new THREE.ConeGeometry( 1.0, 2.0, 3, 1 ),
	new THREE.BoxGeometry( 2.0, 2.0, 2.0 ),
	new THREE.PlaneGeometry( 2.0, 2, 1, 1 ),
	new THREE.CapsuleGeometry( ),
	new THREE.CircleGeometry( 1.0, 3 ),
	new THREE.CylinderGeometry( 1.0, 1.0, 2.0, 3, 1 ),
	new THREE.DodecahedronGeometry( 1.0, 0 ),
	new THREE.IcosahedronGeometry( 1.0, 0 ),
	new THREE.OctahedronGeometry( 1.0, 0 ),
	new THREE.PolyhedronGeometry( [ 0, 0, 0 ], [ 0, 0, 0 ], 1, 0 ),
	new THREE.RingGeometry( 1.0, 1.5, 3 ),
	new THREE.SphereGeometry( 1.0, 3, 2 ),
	new THREE.TetrahedronGeometry( 1.0, 0 ),
	new THREE.TorusGeometry( 1.0, 0.5, 3, 3 ),
	new THREE.TorusKnotGeometry( 1.0, 0.5, 20, 3, 1, 1 ),
];

		}

		function cleanup() {

if ( group ) {

	group.parent.remove( group );

	if ( group.dispose ) {

		group.dispose();

	}

}

		}

		function initMesh( count ) {

cleanup();
initRegularMesh( count );

		}


		function initRegularMesh( count ) {

group = api.renderBundle ? new THREE.BundleGroup() : new THREE.Group();

for ( let i = 0; i < count; i ++ ) {

	const material = new THREE.MeshToonNodeMaterial( {
		color: new THREE.Color( Math.random() * 0xffffff ),
		side: THREE.DoubleSide,
	} );

	const child = new THREE.Mesh( geometries[ i % geometries.length ], material );
	randomizeMatrix( child.matrix );
	child.matrix.decompose( child.position, child.quaternion, child.scale );
	child.userData.rotationSpeed = randomizeRotationSpeed( new THREE.Euler() );
	child.frustumCulled = false;
	group.add( child );

}

scene.add( group );

		}

		async function init( forceWebGL = false ) {

const count = api.count / ( api.webgpu ? 1 : 10 );

renderTimeAverages = [];

if ( renderer ) {

	renderer.dispose();
	controls.dispose();
	document.body.removeChild( stats.dom );
	document.body.removeChild( renderer.domElement );

}

// camera

const aspect = window.innerWidth / window.innerHeight;

camera = new THREE.PerspectiveCamera( 70, aspect, 1, 100 );
camera.position.z = 50;

// renderer

renderer = new THREE.WebGPURenderer( { antialias: true, forceWebGL } );
renderer.setPixelRatio( window.devicePixelRatio );
renderer.setSize( window.innerWidth, window.innerHeight );

renderer.setAnimationLoop( animate );

// scene

scene = new THREE.Scene();
scene.background = new THREE.Color( 0xc1c1c1 );

const light = new THREE.DirectionalLight( 0xffffff, 3.4 );
scene.add( light );

document.body.appendChild( renderer.domElement );

await renderer.init();


initGeometries();
initMesh( count );

controls = new OrbitControls( camera, renderer.domElement );
controls.autoRotate = true;
controls.autoRotateSpeed = 1.0;

// stats

stats = new Stats( {
	precision: 3,
	horizontal: false,
	trackGPU: true,
} );
stats.init( renderer );
document.body.appendChild( stats.dom );
stats.dom.style.position = 'absolute';

// gui

gui = new GUI();
gui.add( api, 'renderBundle' ).onChange( () => {

	init( ! api.webgpu );

} );

gui.add( api, 'webgpu' ).onChange( () => {

	init( ! api.webgpu );

} );

gui.add( api, 'dynamic' ).onChange( () => {

	group.static = ! group.static;

} );


// listeners

window.addEventListener( 'resize', onWindowResize );

function onWindowResize() {

	const width = window.innerWidth;
	const height = window.innerHeight;

	camera.aspect = width / height;
	camera.updateProjectionMatrix();

	renderer.setSize( width, height );
	group.needsUpdate = true;
		
}

async function animate() {

	animateMeshes();

	controls.update();

	const renderTimeAverage = performance.now();
	renderer.render( scene, camera );

	// push only the last 60 render times
	renderTimeAverages.push( performance.now() - renderTimeAverage );
	if ( renderTimeAverages.length > 60 ) renderTimeAverages.shift();
		
	const average = renderTimeAverages.reduce( ( a, b ) => a + b, 0 ) / renderTimeAverages.length;

	renderer.resolveTimestampsAsync();
	stats.update();

	document.getElementById( 'backend' ).innerText = `Average Render Time ${api.renderBundle ? '(Bundle)' : ''}: ` + average.toFixed( 2 ) + 'ms';

}

function animateMeshes() {

	const count = api.count / ( api.webgpu ? 1 : 10 );
	const loopNum = api.dynamic ? count : 0;

	for ( let i = 0; i < loopNum; i ++ ) {

		const child = group.children[ i ];
		const rotationSpeed = child.userData.rotationSpeed;

		child.rotation.set(
			child.rotation.x + rotationSpeed.x,
			child.rotation.y + rotationSpeed.y,
			child.rotation.z + rotationSpeed.z
		);

	}

}

		}
