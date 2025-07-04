// https://github.com/mrdoob/three.js/blob/r175/examples/webgpu_compute_texture.html

import * as THREE from 'three';
import { texture, textureStore, Fn, instanceIndex, float, uvec2, vec4 } from 'three/tsl';

import WebGPU from 'three/addons/capabilities/WebGPU.js';

/* POLYFILL */
import * as polyfill from "../polyfill/polyfill.ts";
await polyfill.init("three.js - WebGPU - Compute Texture");

let camera, scene, renderer;

init();
render();

function init() {

	if ( WebGPU.isAvailable() === false ) {

		document.body.appendChild( WebGPU.getErrorMessage() );

		throw new Error( 'No WebGPU support' );

	}

	const aspect = window.innerWidth / window.innerHeight;
	camera = new THREE.OrthographicCamera( - aspect, aspect, 1, - 1, 0, 2 );
	camera.position.z = 1;

	scene = new THREE.Scene();

	// texture

	const width = 512, height = 512;

	const storageTexture = new THREE.StorageTexture( width, height );
	//storageTexture.minFilter = THREE.LinearMipMapLinearFilter;

	// create function

	const computeTexture = Fn( ( { storageTexture } ) => {

		const posX = instanceIndex.mod( width );
		const posY = instanceIndex.div( width );
		const indexUV = uvec2( posX, posY );

		// https://www.shadertoy.com/view/Xst3zN

		const x = float( posX ).div( 50.0 );
		const y = float( posY ).div( 50.0 );

		const v1 = x.sin();
		const v2 = y.sin();
		const v3 = x.add( y ).sin();
		const v4 = x.mul( x ).add( y.mul( y ) ).sqrt().add( 5.0 ).sin();
		const v = v1.add( v2, v3, v4 );

		const r = v.sin();
		const g = v.add( Math.PI ).sin();
		const b = v.add( Math.PI ).sub( 0.5 ).sin();

		textureStore( storageTexture, indexUV, vec4( r, g, b, 1 ) ).toWriteOnly();

	} );

	// compute

	const computeNode = computeTexture( { storageTexture } ).compute( width * height );

	const material = new THREE.MeshBasicNodeMaterial( { color: 0x00ff00 } );
	material.colorNode = texture( storageTexture );

	const plane = new THREE.Mesh( new THREE.PlaneGeometry( 1, 1 ), material );
	scene.add( plane );

	renderer = new THREE.WebGPURenderer( { antialias: true } );
	renderer.setPixelRatio( window.devicePixelRatio );
	renderer.setSize( window.innerWidth, window.innerHeight );
	document.body.appendChild( renderer.domElement );

	// compute texture
	renderer.computeAsync( computeNode );

	window.addEventListener( 'resize', onWindowResize );

}

function onWindowResize() {

	renderer.setSize( window.innerWidth, window.innerHeight );

	const aspect = window.innerWidth / window.innerHeight;

	const frustumHeight = camera.top - camera.bottom;

	camera.left = - frustumHeight * aspect / 2;
	camera.right = frustumHeight * aspect / 2;

	camera.updateProjectionMatrix();

	render();

}

function render() {

	renderer.renderAsync( scene, camera );

}
