// https://github.com/mrdoob/three.js/blob/r175/examples/webgpu_postprocessing_sobel.html

import * as THREE from 'three';
import { pass, renderOutput } from 'three/tsl';
import { sobel } from 'three/addons/tsl/display/SobelOperatorNode.js';

import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

import { GUI } from 'three/addons/libs/lil-gui.module.min.js';

/* POLYFILL */
import * as polyfill from "../polyfill/polyfill.ts";
await polyfill.init("three.js webgpu - postprocessing sobel");

let camera, scene, renderer, controls;
let postProcessing;

const params = {
	enabled: true
};

init();

async function init() {

	scene = new THREE.Scene();

	camera = new THREE.PerspectiveCamera( 70, window.innerWidth / window.innerHeight, 0.1, 100 );
	camera.position.set( 0, 1, 3 );

	//

	const loader = new GLTFLoader();
	const gltf = await loader.loadAsync( 'models/gltf/DragonAttenuation.glb' );
	const model = gltf.scene.children[ 1 ];
	model.material = new THREE.MeshStandardNodeMaterial();

	scene.add( model );

	//

	renderer = new THREE.WebGPURenderer( { antialias: true } );
	renderer.setPixelRatio( window.devicePixelRatio );
	renderer.setSize( window.innerWidth, window.innerHeight );
	renderer.setAnimationLoop( animate );
	renderer.toneMapping = THREE.LinearToneMapping;
	document.body.appendChild( renderer.domElement );

	await renderer.init();

	const environment = new RoomEnvironment();
	const pmremGenerator = new THREE.PMREMGenerator( renderer );

	scene.environment = pmremGenerator.fromScene( environment ).texture;
	pmremGenerator.dispose();

	//

	controls = new OrbitControls( camera, renderer.domElement );
	controls.enableDamping = true;
	controls.enableZoom = false;
	controls.target.set( 0, 0.5, 0 );
	controls.update();


	// postprocessing

	postProcessing = new THREE.PostProcessing( renderer );
	postProcessing.outputColorTransform = false;

	const scenePass = pass( scene, camera );

	postProcessing.outputNode = sobel( renderOutput( scenePass ) );

	//

	const gui = new GUI();

	gui.add( params, 'enabled' );
	gui.open();

	//

	window.addEventListener( 'resize', onWindowResize );

}


function onWindowResize() {

	camera.aspect = window.innerWidth / window.innerHeight;
	camera.updateProjectionMatrix();

	renderer.setSize( window.innerWidth, window.innerHeight );

}

function animate() {

	controls.update();

	if ( params.enabled === true ) {

		postProcessing.render();

	} else {

		renderer.render( scene, camera );

	}

}
