window.addEventListener('message', e => {
	// Recieving from app window
	if (e.data && e.data.contents && e.data.contents.match(/<html/)) {
		const frame = document.querySelector('iframe');
		frame.src = frame.src;
		setTimeout(() => {
			frame.contentDocument.open();
			frame.contentDocument.write(e.data.contents);
			frame.contentDocument.close();

			updateIframe();
		}, 10);
	}
	if (e.data && e.data.url && e.data.url.match(/index\.html/)) {
		document.querySelector('iframe').src = e.data.url;
		updateIframe();
	}

	// Recieving from preview iframe
	if (e.data && e.data.logs) {
		(window.opener || window.top).postMessage(e.data, '*');
	}
});

function onHover() {
	updateIframe().then(() => {
		document.querySelector('iframe').style.display = 'none';
	});
}

function updateIframe() {
	let iframe = document.querySelector('iframe');

	if (iframe.style.display !== 'none') {
		return html2canvas(document.querySelector('iframe').contentDocument.body, {
			x: 0,
			y: 0,
			width: 512,
			height: 512
		}).then(canvas => {
			// Append the canvas to the body or do something with it
			canvas.id = 'html-canvas';
			canvas.classList.add('holder-size');

			document.getElementById('canvas-holder').innerHTML = ''; // Clear previous canvas if any
			document.getElementById('canvas-holder').appendChild(canvas);

			calculateScore();
		});
	}
	return Promise.resolve();
}

function calculateScore() {
	// Draw the image to canvas
	const img = document.getElementById('source-image');
	const canvas2 = document.getElementById('image-canvas');
	const ctx2 = canvas2.getContext('2d');
	ctx2.drawImage(img, 0, 0, canvas2.width, canvas2.height);

	let canvas1 = document.getElementById('html-canvas');
	const ctx1 = canvas1.getContext('2d');

	// Get image data
	const imgData1 = ctx1.getImageData(0, 0, canvas1.width, canvas1.height).data;
	const imgData2 = ctx2.getImageData(0, 0, canvas2.width, canvas2.height).data;

	const len = Math.min(imgData1.length, 512 * 512 * 4);

	// 4. Compare pixels
	let differentPixels = 0;
	for (let i = 0; i < len; i += 4) {
		const r1 = imgData1[i],
			g1 = imgData1[i + 1],
			b1 = imgData1[i + 2],
			a1 = imgData1[i + 3];
		const r2 = imgData2[i],
			g2 = imgData2[i + 1],
			b2 = imgData2[i + 2],
			a2 = imgData2[i + 3];
		//console.log('Comparing pixels', r1, g1, b1, a1, r2, g2, b2, a2);

		if (r1 !== r2 || g1 !== g2 || b1 !== b2 || a1 !== a2) {
			differentPixels++;
		}
	}
	console.log(
		'Different pixels:',
		differentPixels,
		canvas1.width * canvas1.height
	);
	const percentDiff =
		(1 - differentPixels / (canvas1.width * canvas1.height)) * 100;

	console.log('Score: ', percentDiff);
	(window.opener || window.top).postMessage({ score: percentDiff }, '*');
}

function onMove() {
	let canvas = document.getElementById('html-canvas');
	let body = document.querySelector('body');

	body.addEventListener('mousemove', function (e) {
		const rect = canvas.getBoundingClientRect();
		const x = e.clientX - rect.left;
		const percent = Math.max((x / rect.width) * 100, 0);

		const maxPercent = Math.min(percent, 100);
		canvas.style.clipPath = `inset(0 ${100 - maxPercent}% 0 0)`;

		if (percent >= 100) {
			canvas.style.opacity = '0.5';
		} else {
			canvas.style.opacity = '1';
		}
	});
}
