// https://github.com/mrdoob/three.js/blob/r175/examples/webgpu_postprocessing_ao.html

import * as THREE from 'three';
import { pass, mrt, output, normalView } from 'three/tsl';
import { ao } from 'three/addons/tsl/display/GTAONode.js';
import { denoise } from 'three/addons/tsl/display/DenoiseNode.js';

import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

import Stats from 'three/addons/libs/stats.module.js';
import { GUI } from 'three/addons/libs/lil-gui.module.min.js';

/* POLYFILL */
import * as polyfill from "../polyfill/polyfill.ts";
await polyfill.init("three.js webgpu - ambient occlusion (GTAO)");

let camera, scene, renderer, postProcessing, controls, stats;

let aoPass, denoisePass, blendPassAO, blendPassDenoise, scenePassColor;

const params = {
	distanceExponent: 1,
	distanceFallOff: 1,
	radius: 0.25,
	scale: 1,
	thickness: 1,
	denoised: false,
	enabled: true,
	denoiseRadius: 5,
	lumaPhi: 5,
	depthPhi: 5,
	normalPhi: 5
};

init();

async function init() {

	camera = new THREE.PerspectiveCamera( 45, window.innerWidth / window.innerHeight, 0.1, 50 );
	camera.position.set( 1, 1.3, 5 );

	scene = new THREE.Scene();

	renderer = new THREE.WebGPURenderer();
	renderer.setPixelRatio( window.devicePixelRatio );
	renderer.setSize( window.innerWidth, window.innerHeight );
	renderer.setAnimationLoop( animate );
	document.body.appendChild( renderer.domElement );

	await renderer.init();

	const environment = new RoomEnvironment();
	const pmremGenerator = new THREE.PMREMGenerator( renderer );

	scene.background = new THREE.Color( 0x666666 );
	scene.environment = pmremGenerator.fromScene( environment ).texture;
	environment.dispose();
	pmremGenerator.dispose();

	//

	controls = new OrbitControls( camera, renderer.domElement );
	controls.target.set( 0, 0.5, - 1 );
	controls.update();
	controls.enablePan = false;
	controls.enableDamping = true;
	controls.minDistance = 2;
	controls.maxDistance = 8;

	stats = new Stats();
	document.body.appendChild( stats.dom );

	//

	postProcessing = new THREE.PostProcessing( renderer );

	const scenePass = pass( scene, camera );
	scenePass.setMRT( mrt( {
		output: output,
		normal: normalView
	} ) );

	scenePassColor = scenePass.getTextureNode( 'output' );
	const scenePassNormal = scenePass.getTextureNode( 'normal' );
	const scenePassDepth = scenePass.getTextureNode( 'depth' );

	// ao

	aoPass = ao( scenePassDepth, scenePassNormal, camera );
	aoPass.resolutionScale = 0.5;
	blendPassAO = aoPass.getTextureNode().mul( scenePassColor );

	// denoise (optional)

	denoisePass = denoise( aoPass.getTextureNode(), scenePassDepth, scenePassNormal, camera );
	blendPassDenoise = denoisePass.mul( scenePassColor );

	postProcessing.outputNode = blendPassAO;

	//

	const dracoLoader = new DRACOLoader();
	dracoLoader.setDecoderPath( 'jsm/libs/draco/' );
	dracoLoader.setDecoderConfig( { type: 'js' } );
	const loader = new GLTFLoader();
	loader.setDRACOLoader( dracoLoader );
	loader.setPath( 'models/gltf/' );

	const gltf = await loader.loadAsync( 'minimalistic_modern_bedroom.glb' );

	const model = gltf.scene;
	model.position.set( 0, 1, 0 );
	scene.add( model );

	model.traverse( ( o ) => {

		// Transparent objects (e.g. loaded via GLTFLoader) might have "depthWrite" set to "false".
		// This is wanted when rendering the beauty pass however it produces wrong results when computing
		// AO since depth and normal data are out of sync. Computing normals from depth by not using MRT
		// can mitigate the issue although the depth information (and thus the normals) are not correct in
		// first place. Besides, normal estimation is computationally more expensive than just sampling a
		// normal texture. So depending on your scene, consider to enable "depthWrite" for all transparent objects.

		if ( o.material ) o.material.depthWrite = true;

	} );

	window.addEventListener( 'resize', onWindowResize );

	//

	const gui = new GUI();
	gui.title( 'AO settings' );
	gui.add( params, 'distanceExponent' ).min( 1 ).max( 4 ).onChange( updateParameters );
	gui.add( params, 'distanceFallOff' ).min( 0.01 ).max( 1 ).onChange( updateParameters );
	gui.add( params, 'radius' ).min( 0.01 ).max( 1 ).onChange( updateParameters );
	gui.add( params, 'scale' ).min( 0.01 ).max( 2 ).onChange( updateParameters );
	gui.add( params, 'thickness' ).min( 0.01 ).max( 2 ).onChange( updateParameters );
	gui.add( params, 'enabled' ).onChange( updatePassChain );
	const folder = gui.addFolder( 'Denoise settings' );
	folder.add( params, 'denoiseRadius' ).min( 0.01 ).max( 10 ).name( 'radius' ).onChange( updateParameters );
	folder.add( params, 'lumaPhi' ).min( 0.01 ).max( 10 ).onChange( updateParameters );
	folder.add( params, 'depthPhi' ).min( 0.01 ).max( 10 ).onChange( updateParameters );
	folder.add( params, 'normalPhi' ).min( 0.01 ).max( 10 ).onChange( updateParameters );
	folder.add( params, 'denoised' ).name( 'enabled' ).onChange( updatePassChain );

}

function updatePassChain() {

	if ( params.enabled === true ) {

		if ( params.denoised === true ) {

			postProcessing.outputNode = blendPassDenoise;

		} else {

			postProcessing.outputNode = blendPassAO;

		}

	} else {

		postProcessing.outputNode = scenePassColor;

	}

	postProcessing.needsUpdate = true;


}

function updateParameters() {

	aoPass.distanceExponent.value = params.distanceExponent;
	aoPass.distanceFallOff.value = params.distanceFallOff;
	aoPass.radius.value = params.radius;
	aoPass.scale.value = params.scale;
	aoPass.thickness.value = params.thickness;

	denoisePass.radius.value = params.denoiseRadius;
	denoisePass.lumaPhi.value = params.lumaPhi;
	denoisePass.depthPhi.value = params.depthPhi;
	denoisePass.normalPhi.value = params.normalPhi;

}

function onWindowResize() {

	const width = window.innerWidth;
	const height = window.innerHeight;

	camera.aspect = width / height;
	camera.updateProjectionMatrix();

	renderer.setSize( width, height );

}

function animate() {

	controls.update();

	postProcessing.render();
	stats.update();

}
