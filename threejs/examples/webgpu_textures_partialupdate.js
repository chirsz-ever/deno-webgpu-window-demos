// https://github.com/mrdoob/three.js/blob/r175/examples/webgpu_textures_partialupdate.html

import * as THREE from 'three';

/* POLYFILL */
import * as polyfill from "../polyfill/polyfill.ts";
await polyfill.init("three.js webgl - webgpu partial texture update");

let camera, scene, renderer, clock, dataTexture, diffuseMap;

let last = 0;
const position = new THREE.Vector2();
const color = new THREE.Color();

init();

function init() {

	camera = new THREE.PerspectiveCamera( 70, window.innerWidth / window.innerHeight, 0.01, 10 );
	camera.position.z = 2;

	scene = new THREE.Scene();

	clock = new THREE.Clock();

	const loader = new THREE.TextureLoader();
	diffuseMap = loader.load( 'textures/carbon/Carbon.png', animate );
	diffuseMap.colorSpace = THREE.SRGBColorSpace;
	diffuseMap.minFilter = THREE.LinearFilter;
	diffuseMap.generateMipmaps = false;

	const geometry = new THREE.PlaneGeometry( 2, 2 );
	const material = new THREE.MeshBasicMaterial( { map: diffuseMap } );

	const mesh = new THREE.Mesh( geometry, material );
	scene.add( mesh );

	//

	const width = 32;
	const height = 32;

	const data = new Uint8Array( width * height * 4 );
	dataTexture = new THREE.DataTexture( data, width, height );

	//

	renderer = new THREE.WebGPURenderer( { antialias: true, forceWebGL: false } );
	renderer.setPixelRatio( window.devicePixelRatio );
	renderer.setSize( window.innerWidth, window.innerHeight );

	document.body.appendChild( renderer.domElement );

	//

	window.addEventListener( 'resize', onWindowResize );

}

function onWindowResize() {

	camera.aspect = window.innerWidth / window.innerHeight;
	camera.updateProjectionMatrix();

	renderer.setSize( window.innerWidth, window.innerHeight );

}

async function animate() {

	requestAnimationFrame( animate );

	const elapsedTime = clock.getElapsedTime();


	await renderer.renderAsync( scene, camera );


	if ( elapsedTime - last > 0.1 ) {

		last = elapsedTime;

		position.x = ( 32 * THREE.MathUtils.randInt( 1, 16 ) ) - 32;
		position.y = ( 32 * THREE.MathUtils.randInt( 1, 16 ) ) - 32;

		// generate new color data
		updateDataTexture( dataTexture );

		// perform copy from src to dest texture to a random position

		renderer.copyTextureToTexture( dataTexture, diffuseMap, null, position );

	}

}

function updateDataTexture( texture ) {

	const size = texture.image.width * texture.image.height;
	const data = texture.image.data;

	// generate a random color and update texture data

	color.setHex( Math.random() * 0xffffff );

	const r = Math.floor( color.r * 255 );
	const g = Math.floor( color.g * 255 );
	const b = Math.floor( color.b * 255 );

	for ( let i = 0; i < size; i ++ ) {

		const stride = i * 4;

		data[ stride ] = r;
		data[ stride + 1 ] = g;
		data[ stride + 2 ] = b;
		data[ stride + 3 ] = 1;

	}

	texture.needsUpdate = true;

}
