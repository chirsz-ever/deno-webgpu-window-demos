// https://github.com/mrdoob/three.js/blob/r175/examples/webgpu_cubemap_mix.html

import * as THREE from 'three';
import { mix, oscSine, time, pmremTexture, float } from 'three/tsl';

import { RGBMLoader } from 'three/addons/loaders/RGBMLoader.js';

import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

/* POLYFILL */
import * as polyfill from "../polyfill/polyfill.ts";
await polyfill.init("three.js webgpu - cubemap mix");

let camera, scene, renderer;

init();

async function init() {

	const container = document.createElement( 'div' );
	document.body.appendChild( container );

	camera = new THREE.PerspectiveCamera( 45, window.innerWidth / window.innerHeight, 0.25, 20 );
	camera.position.set( - 1.8, 0.6, 2.7 );

	scene = new THREE.Scene();

	const rgbmUrls = [ 'px.png', 'nx.png', 'py.png', 'ny.png', 'pz.png', 'nz.png' ];
	const cube1Texture = new RGBMLoader()
		.setMaxRange( 16 )
		.setPath( './textures/cube/pisaRGBM16/' )
		.loadCubemap( rgbmUrls );

	cube1Texture.generateMipmaps = true;
	cube1Texture.minFilter = THREE.LinearMipmapLinearFilter;

	const cube2Urls = [ 'dark-s_px.jpg', 'dark-s_nx.jpg', 'dark-s_py.jpg', 'dark-s_ny.jpg', 'dark-s_pz.jpg', 'dark-s_nz.jpg' ];
	const cube2Texture = await new THREE.CubeTextureLoader()
		.setPath( './textures/cube/MilkyWay/' )
		.loadAsync( cube2Urls );

	cube2Texture.generateMipmaps = true;
	cube2Texture.minFilter = THREE.LinearMipmapLinearFilter;

	scene.environmentNode = mix( pmremTexture( cube2Texture ), pmremTexture( cube1Texture ), oscSine( time.mul( .1 ) ) );

	scene.backgroundNode = scene.environmentNode.context( {
		getTextureLevel: () => float( .5 )
	} );

	const loader = new GLTFLoader().setPath( 'models/gltf/DamagedHelmet/glTF/' );
	const gltf = await loader.loadAsync( 'DamagedHelmet.gltf' );

	scene.add( gltf.scene );

	renderer = new THREE.WebGPURenderer( { antialias: true } );

	renderer.setPixelRatio( window.devicePixelRatio );
	renderer.setSize( window.innerWidth, window.innerHeight );
	renderer.toneMapping = THREE.LinearToneMapping;
	renderer.setAnimationLoop( render );
	container.appendChild( renderer.domElement );

	const controls = new OrbitControls( camera, renderer.domElement );
	controls.minDistance = 2;
	controls.maxDistance = 10;

	window.addEventListener( 'resize', onWindowResize );

}

function onWindowResize() {

	camera.aspect = window.innerWidth / window.innerHeight;
	camera.updateProjectionMatrix();

	renderer.setSize( window.innerWidth, window.innerHeight );

}

//

function render() {

	renderer.render( scene, camera );

}
