// https://github.com/mrdoob/three.js/blob/r175/examples/webgpu_depth_texture.html

import * as THREE from 'three';
import { texture } from 'three/tsl';

import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

/* POLYFILL */
import * as polyfill from "../polyfill/polyfill.ts";
await polyfill.init("three.js webgpu - depth texture");

let camera, scene, controls, renderer;

let quad, renderTarget;

const dpr = window.devicePixelRatio;

init();

function init() {

	camera = new THREE.PerspectiveCamera( 70, window.innerWidth / window.innerHeight, 1, 20 );
	camera.position.z = 4;

	scene = new THREE.Scene();
	scene.background = new THREE.Color( 0x222222 );
	scene.overrideMaterial = new THREE.MeshBasicNodeMaterial();

	//

	const geometry = new THREE.TorusKnotGeometry( 1, 0.3, 128, 64 );

	const count = 50;
	const scale = 5;

	for ( let i = 0; i < count; i ++ ) {

		const r = Math.random() * 2.0 * Math.PI;
		const z = ( Math.random() * 2.0 ) - 1.0;
		const zScale = Math.sqrt( 1.0 - z * z ) * scale;

		const mesh = new THREE.Mesh( geometry );
		mesh.position.set(
			Math.cos( r ) * zScale,
			Math.sin( r ) * zScale,
			z * scale
		);
		mesh.rotation.set( Math.random(), Math.random(), Math.random() );
		scene.add( mesh );

	}

	//

	renderer = new THREE.WebGPURenderer( { antialias: true } );
	renderer.setPixelRatio( dpr );
	renderer.setSize( window.innerWidth, window.innerHeight );
	renderer.setAnimationLoop( animate );
	document.body.appendChild( renderer.domElement );

	const depthTexture = new THREE.DepthTexture();
	depthTexture.type = THREE.FloatType;

	renderTarget = new THREE.RenderTarget( window.innerWidth * dpr, window.innerHeight * dpr );
	renderTarget.depthTexture = depthTexture;

	window.addEventListener( 'resize', onWindowResize );

	// FX

	const materialFX = new THREE.MeshBasicNodeMaterial();
	materialFX.colorNode = texture( depthTexture );

	quad = new THREE.QuadMesh( materialFX );

	//

	controls = new OrbitControls( camera, renderer.domElement );
	controls.enableDamping = true;

}

function onWindowResize() {

	camera.aspect = window.innerWidth / window.innerHeight;
	camera.updateProjectionMatrix();

	renderer.setSize( window.innerWidth, window.innerHeight );
	renderTarget.setSize( window.innerWidth * dpr, window.innerHeight * dpr );

}

function animate() {

	renderer.setRenderTarget( renderTarget );
	renderer.render( scene, camera );

	renderer.setRenderTarget( null );
	quad.render( renderer );

}
