// https://github.com/mrdoob/three.js/blob/r175/examples/webgpu_materialx_noise.html

import * as THREE from 'three';
import { normalWorld, time, mx_noise_vec3, mx_worley_noise_vec3, mx_cell_noise_float, mx_fractal_noise_vec3 } from 'three/tsl';

import Stats from 'three/addons/libs/stats.module.js';

import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { HDRCubeTextureLoader } from 'three/addons/loaders/HDRCubeTextureLoader.js';

/* POLYFILL */
import * as polyfill from "../polyfill/polyfill.ts";
await polyfill.init("three.js webgpu - materialx noise");

let container, stats;

let camera, scene, renderer;

let particleLight;
let group;

init();

function init() {

	container = document.createElement( 'div' );
	document.body.appendChild( container );

	camera = new THREE.PerspectiveCamera( 27, window.innerWidth / window.innerHeight, 1, 1000 );
	camera.position.z = 100;

	scene = new THREE.Scene();

	group = new THREE.Group();
	scene.add( group );

	new HDRCubeTextureLoader()
		.setPath( 'textures/cube/pisaHDR/' )
		.load( [ 'px.hdr', 'nx.hdr', 'py.hdr', 'ny.hdr', 'pz.hdr', 'nz.hdr' ],
			function ( hdrTexture ) {

				const geometry = new THREE.SphereGeometry( 8, 64, 32 );

				const customUV = normalWorld.mul( 10 ).add( time );

				// left top

				let material = new THREE.MeshPhysicalNodeMaterial();
				material.colorNode = mx_noise_vec3( customUV );

				let mesh = new THREE.Mesh( geometry, material );
				mesh.position.x = - 10;
				mesh.position.y = 10;
				group.add( mesh );

				// right top

				material = new THREE.MeshPhysicalNodeMaterial();
				material.colorNode = mx_cell_noise_float( customUV );

				mesh = new THREE.Mesh( geometry, material );
				mesh.position.x = 10;
				mesh.position.y = 10;
				group.add( mesh );

				// left bottom

				material = new THREE.MeshPhysicalNodeMaterial();
				material.colorNode = mx_worley_noise_vec3( customUV );

				mesh = new THREE.Mesh( geometry, material );
				mesh.position.x = - 10;
				mesh.position.y = - 10;
				group.add( mesh );

				// right bottom

				material = new THREE.MeshPhysicalNodeMaterial();
				material.colorNode = mx_fractal_noise_vec3( customUV.mul( .2 ) );

				mesh = new THREE.Mesh( geometry, material );
				mesh.position.x = 10;
				mesh.position.y = - 10;
				group.add( mesh );

				//

				scene.background = hdrTexture;
				scene.environment = hdrTexture;

			}

		);

	// LIGHTS

	particleLight = new THREE.Mesh(
		new THREE.SphereGeometry( 0.4, 8, 8 ),
		new THREE.MeshBasicMaterial( { color: 0xffffff } )
	);
	scene.add( particleLight );

	particleLight.add( new THREE.PointLight( 0xffffff, 1000 ) );

	renderer = new THREE.WebGPURenderer( { antialias: true } );
	renderer.setAnimationLoop( animate );
	renderer.setPixelRatio( window.devicePixelRatio );
	renderer.setSize( window.innerWidth, window.innerHeight );
	container.appendChild( renderer.domElement );

	//

	renderer.toneMapping = THREE.ACESFilmicToneMapping;
	renderer.toneMappingExposure = 1.25;

	//


	//

	stats = new Stats();
	container.appendChild( stats.dom );

	// EVENTS

	new OrbitControls( camera, renderer.domElement );

	window.addEventListener( 'resize', onWindowResize );

}

//

function onWindowResize() {

	const width = window.innerWidth;
	const height = window.innerHeight;

	camera.aspect = width / height;
	camera.updateProjectionMatrix();

	renderer.setSize( width, height );

}

//

function animate() {

	render();

	stats.update();

}

function render() {

	const timer = Date.now() * 0.00025;

	particleLight.position.x = Math.sin( timer * 7 ) * 30;
	particleLight.position.y = Math.cos( timer * 5 ) * 40;
	particleLight.position.z = Math.cos( timer * 3 ) * 30;

	for ( let i = 0; i < group.children.length; i ++ ) {

		const child = group.children[ i ];
		child.rotation.y += 0.005;

	}

	renderer.render( scene, camera );

}
