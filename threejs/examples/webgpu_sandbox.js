// https://github.com/mrdoob/three.js/blob/r175/examples/webgpu_sandbox.html

import * as THREE from 'three';
import { time, vec2, uv, texture, mix, checker, normalLocal, positionLocal, color, oscSine, attribute } from 'three/tsl';

import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';

/* POLYFILL */
import * as polyfill from "../polyfill/polyfill.ts";
await polyfill.init("three.js webgpu - sandbox");

let camera, scene, renderer;

let box;

init();

async function init() {

	camera = new THREE.PerspectiveCamera( 70, window.innerWidth / window.innerHeight, 0.1, 10 );
	camera.position.z = 4;

	scene = new THREE.Scene();
	scene.background = new THREE.Color( 0x222222 );

	//

	renderer = new THREE.WebGPURenderer( { antialias: true } );
	renderer.setPixelRatio( window.devicePixelRatio );
	renderer.setSize( window.innerWidth, window.innerHeight );
	renderer.setAnimationLoop( animate );
	document.body.appendChild( renderer.domElement );

	// textures

	const textureLoader = new THREE.TextureLoader();
	const uvTexture = textureLoader.load( './textures/uv_grid_opengl.jpg' );
	uvTexture.wrapS = THREE.RepeatWrapping;
	uvTexture.wrapT = THREE.RepeatWrapping;
	uvTexture.name = 'uv_grid';

	const textureDisplace = textureLoader.load( './textures/transition/transition1.png' );
	textureDisplace.wrapS = THREE.RepeatWrapping;
	textureDisplace.wrapT = THREE.RepeatWrapping;

	const ktxLoader = await new KTX2Loader()
		.setTranscoderPath( 'jsm/libs/basis/' )
		.detectSupportAsync( renderer );

	const ktxTexture = await ktxLoader.loadAsync( './textures/compressed/sample_uastc_zstd.ktx2' );

	// box mesh

	const geometryBox = new THREE.BoxGeometry();
	const materialBox = new THREE.MeshBasicNodeMaterial();

	// birection speed

	const timerScaleNode = time.mul( vec2( - 0.5, 0.1 ) );
	const animateUV = uv().add( timerScaleNode );

	const textureNode = texture( uvTexture, animateUV );

	materialBox.colorNode = mix( textureNode, checker( animateUV ), 0.5 );

	// test uv 2
	//geometryBox.setAttribute( 'uv1', geometryBox.getAttribute( 'uv' ) );
	//materialBox.colorNode = texture( uvTexture, uv( 1 ) );

	box = new THREE.Mesh( geometryBox, materialBox );
	box.position.set( 0, 1, 0 );
	scene.add( box );

	// displace example

	const geometrySphere = new THREE.SphereGeometry( .5, 64, 64 );
	const materialSphere = new THREE.MeshBasicNodeMaterial();

	const displaceY = texture( textureDisplace ).x.mul( 0.25 );

	const displace = normalLocal.mul( displaceY );

	materialSphere.colorNode = displaceY;
	materialSphere.positionNode = positionLocal.add( displace );

	const sphere = new THREE.Mesh( geometrySphere, materialSphere );
	sphere.position.set( - 2, - 1, 0 );
	scene.add( sphere );

	// data texture

	const geometryPlane = new THREE.PlaneGeometry();
	const materialPlane = new THREE.MeshBasicNodeMaterial();
	materialPlane.colorNode = texture( createDataTexture() ).add( color( 0x0000FF ) );
	materialPlane.transparent = true;

	const plane = new THREE.Mesh( geometryPlane, materialPlane );
	plane.position.set( 0, - 1, 0 );
	scene.add( plane );

	// compressed texture

	const materialCompressed = new THREE.MeshBasicNodeMaterial();
	materialCompressed.colorNode = texture( ktxTexture );
	materialCompressed.emissiveNode = oscSine().mix( color( 0x663300 ), color( 0x0000FF ) );
	materialCompressed.alphaTestNode = oscSine();
	materialCompressed.transparent = true;

	const geo = flipY( new THREE.PlaneGeometry() );
	const planeCompressed = new THREE.Mesh( geo, materialCompressed );
	planeCompressed.position.set( - 2, 1, 0 );
	scene.add( planeCompressed );

	// points

	const points = [];

	for ( let i = 0; i < 1000; i ++ ) {

		const point = new THREE.Vector3().random().subScalar( 0.5 );
		points.push( point );

	}

	const geometryPoints = new THREE.BufferGeometry().setFromPoints( points );
	const materialPoints = new THREE.PointsNodeMaterial();

	materialPoints.colorNode = positionLocal.mul( 3 );

	const pointCloud = new THREE.Points( geometryPoints, materialPoints );
	pointCloud.position.set( 2, - 1, 0 );
	scene.add( pointCloud );

	// lines

	const geometryLine = new THREE.BufferGeometry().setFromPoints( [
		new THREE.Vector3( - 0.5, - 0.5, 0 ),
		new THREE.Vector3( 0.5, - 0.5, 0 ),
		new THREE.Vector3( 0.5, 0.5, 0 ),
		new THREE.Vector3( - 0.5, 0.5, 0 ),
		new THREE.Vector3( - 0.5, - 0.5, 0 )
	] );

	geometryLine.setAttribute( 'color', geometryLine.getAttribute( 'position' ) );

	const materialLine = new THREE.LineBasicNodeMaterial();
	materialLine.colorNode = attribute( 'color' );

	const line = new THREE.Line( geometryLine, materialLine );
	line.position.set( 2, 1, 0 );
	scene.add( line );

	window.addEventListener( 'resize', onWindowResize );

}

function onWindowResize() {

	camera.aspect = window.innerWidth / window.innerHeight;
	camera.updateProjectionMatrix();

	renderer.setSize( window.innerWidth, window.innerHeight );

}

function animate() {

	if ( box ) {

		box.rotation.x += 0.01;
		box.rotation.y += 0.02;

	}

	renderer.render( scene, camera );

}

function createDataTexture() {

	const color = new THREE.Color( 0xff0000 );

	const width = 512;
	const height = 512;

	const size = width * height;
	const data = new Uint8Array( 4 * size );

	const r = Math.floor( color.r * 255 );
	const g = Math.floor( color.g * 255 );
	const b = Math.floor( color.b * 255 );

	for ( let i = 0; i < size; i ++ ) {

		const stride = i * 4;

		data[ stride ] = r;
		data[ stride + 1 ] = g;
		data[ stride + 2 ] = b;
		data[ stride + 3 ] = 255;

	}

	const texture = new THREE.DataTexture( data, width, height, THREE.RGBAFormat );
	texture.needsUpdate = true;
	return texture;

}

/** Correct UVs to be compatible with `flipY=false` textures. */
function flipY( geometry ) {

	const uv = geometry.attributes.uv;

	for ( let i = 0; i < uv.count; i ++ ) {

		uv.setY( i, 1 - uv.getY( i ) );

	}

	return geometry;

}
