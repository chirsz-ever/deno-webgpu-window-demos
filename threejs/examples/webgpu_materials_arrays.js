// https://github.com/mrdoob/three.js/blob/r175/examples/webgpu_materials_arrays.html

import * as THREE from 'three';

import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GUI } from 'three/addons/libs/lil-gui.module.min.js';

/* POLYFILL */
import * as polyfill from "../polyfill/polyfill.ts";
await polyfill.init("three.js webgpu - materials arrays and geometry groups");

let renderer, scene, camera, controls;
let planeMesh, boxMesh, boxMeshWireframe, planeMeshWireframe;
let materials;

const api = {
	webgpu: true
};


init( ! api.webgpu );

function init( forceWebGL = false ) {

	if ( renderer ) {

		renderer.dispose();
		controls.dispose();
		document.body.removeChild( renderer.domElement );

	}

	// renderer
	renderer = new THREE.WebGPURenderer( {
		forceWebGL,
		antialias: true,
	} );
	renderer.setSize( window.innerWidth, window.innerHeight );
	renderer.setPixelRatio( window.devicePixelRatio );
	renderer.setAnimationLoop( animate );
	document.body.appendChild( renderer.domElement );

	// scene
	scene = new THREE.Scene();
	scene.background = new THREE.Color( 0x000000 );

	// camera
	camera = new THREE.PerspectiveCamera( 40, window.innerWidth / window.innerHeight, 1, 100 );
	camera.position.set( 0, 0, 10 );

	// controls
	controls = new OrbitControls( camera, renderer.domElement );

	// materials
	materials = [
		new THREE.MeshBasicMaterial( { color: 0xff1493, side: THREE.DoubleSide } ),
		new THREE.MeshBasicMaterial( { color: 0x0000ff, side: THREE.DoubleSide } ),
		new THREE.MeshBasicMaterial( { color: 0x00ff00, side: THREE.DoubleSide } ),
	];

	// plane geometry
	const planeGeometry = new THREE.PlaneGeometry( 1, 1, 4, 4 );

	planeGeometry.clearGroups();
	const numFacesPerRow = 4; // Number of faces in a row (since each face is made of 2 triangles)

	planeGeometry.addGroup( 0, 6 * numFacesPerRow, 0 );
	planeGeometry.addGroup( 6 * numFacesPerRow, 6 * numFacesPerRow, 1 );
	planeGeometry.addGroup( 12 * numFacesPerRow, 6 * numFacesPerRow, 2 );

	// box geometry
	const boxGeometry = new THREE.BoxGeometry( .75, .75, .75 );

	boxGeometry.clearGroups();
	boxGeometry.addGroup( 0, 6, 0 ); // front face
	boxGeometry.addGroup( 6, 6, 0 ); // back face
	boxGeometry.addGroup( 12, 6, 2 ); // top face
	boxGeometry.addGroup( 18, 6, 2 ); // bottom face
	boxGeometry.addGroup( 24, 6, 1 ); // left face
	boxGeometry.addGroup( 30, 6, 1 ); // right face

	scene.background = forceWebGL ? new THREE.Color( 0x000000 ) : new THREE.Color( 0x222222 );

	// meshes
	planeMesh = new THREE.Mesh( planeGeometry, materials );

	const materialsWireframe = [];

	for ( let index = 0; index < materials.length; index ++ ) {

		const material = new THREE.MeshBasicMaterial( { color: materials[ index ].color, side: THREE.DoubleSide, wireframe: true } );
		materialsWireframe.push( material );

	}

	planeMeshWireframe = new THREE.Mesh( planeGeometry, materialsWireframe );
	boxMeshWireframe = new THREE.Mesh( boxGeometry, materialsWireframe );

	boxMesh = new THREE.Mesh( boxGeometry, materials );

	planeMesh.position.set( - 1.5, - 1, 0 );
	boxMesh.position.set( 1.5, - 0.75, 0 );
	boxMesh.rotation.set( - Math.PI / 8, Math.PI / 4, Math.PI / 4 );

	planeMeshWireframe.position.set( - 1.5, 1, 0 );
	boxMeshWireframe.position.set( 1.5, 1.25, 0 );
	boxMeshWireframe.rotation.set( - Math.PI / 8, Math.PI / 4, Math.PI / 4 );

	scene.add( planeMesh, planeMeshWireframe );
	scene.add( boxMesh, boxMeshWireframe );

}

function animate() {

	boxMesh.rotation.y += 0.005;
	boxMesh.rotation.x += 0.005;
	boxMeshWireframe.rotation.y += 0.005;
	boxMeshWireframe.rotation.x += 0.005;
	renderer.render( scene, camera );

}


// gui

const gui = new GUI();

gui.add( api, 'webgpu' ).onChange( () => {

	init( ! api.webgpu );

} );

// listeners

window.addEventListener( 'resize', onWindowResize );

function onWindowResize() {

	const width = window.innerWidth;
	const height = window.innerHeight;

	camera.aspect = width / height;
	camera.updateProjectionMatrix();

	renderer.setSize( width, height );

}
