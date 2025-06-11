/* global htmlCodeEl, cssCodeEl, jsCodeEl
 */

import { Component } from 'preact';

import { log, getCompleteHtml } from '../utils';
import Modal from './Modal.jsx';
import { VStack } from './Stack.jsx';

import '../db';
import { trackEvent } from '../analytics';

import { I18nProvider } from '@lingui/react';

if (module.hot) {
	require('preact/debug');
}

const UNSAVED_WARNING_COUNT = 15;
const version = '6.4.0';

// Read forced settings as query parameters
window.forcedSettings = {};
window.codeHtml = '';
window.codeCss = '';
if (location.search) {
	let match = location.search.replace(/^\?/, '').match(/settings=([^=]*)/);
	if (match) {
		match = match[1];
		match.split(',').map(pair => {
			pair = pair.split(':');
			if (pair[1] === 'true') pair[1] = true;
			else if (pair[1] === 'false') pair[1] = false;
			window.forcedSettings[pair[0]] = pair[1];
		});
	}

	const params = new URLSearchParams(location.search);
	window.codeHtml = params.get('html') || '';
	window.codeCss = params.get('css') || '';
}

export default class ViewerApp extends Component {
	constructor() {
		super();
		this.AUTO_SAVE_INTERVAL = 15000; // 15 seconds
		this.modalDefaultStates = {};
		this.state = {
			isSavedItemPaneOpen: false,
			...this.modalDefaultStates,
			prefs: {},
			catalogs: {},
			people: [],
			modal: {
				show: false,
				html: '',
				css: '',
				js: ''
			}
		};
	}

	componentDidMount() {
		// Listen for logs from preview frame
		window.addEventListener('message', e => {
			if (e.data && e.data.id) {
				const person = this.state.people.find(p => p.id === e.data.id);
				console.log(person);
				if (person && e.data.score) {
					person.score = e.data.score;
					this.setState({ people: this.state.people });
				}
			}
		});

		function setBodySize() {
			document.body.style.height = `${window.innerHeight}px`;
		}
		window.addEventListener('resize', () => {
			setBodySize();
		});

		this.loadPeople();
	}

	shouldComponentUpdate(nextProps, nextState) {
		const { catalogs } = nextState;
		const { lang } = nextState.prefs;

		if (lang && lang !== 'en' && !catalogs[lang]) {
			this.loadLanguage(lang);
		}

		return true;
	}

	getRootClasses() {
		const classes = [];
		if (this.state.currentItem && this.state.currentItem.files) {
			classes.push('is-file-mode');
		}
		return classes.join(' ');
	}

	loadPeople() {
		fetch('http://localhost:8081/')
			.then(response => response.json())
			.then(data => {
				this.updatePeople(data);
			})
			.catch(error => {
				console.error('Error fetching people:', error);
			});

		setInterval(() => {
			fetch('http://localhost:8081/')
				.then(response => response.json())
				.then(data => {
					this.updatePeople(data);
				})
				.catch(error => {
					console.error('Error fetching people:', error);
				});
		}, 5000);
	}

	updatePeople(data) {
		const currentPoeple = this.state.people;
		this.setState({ people: data });

		data.forEach(person => {
			let inCurrent = currentPoeple.find(p => p.id === person.id);
			if (inCurrent && Math.random() > 0.1) {
				person.score = inCurrent.score;

				if (
					inCurrent.html == person.html &&
					inCurrent.css == person.css &&
					inCurrent.js == person.js
				) {
					return;
				}
			}

			const frame = document.getElementById('frame-' + person.id);

			if (frame) {
				this.createPreviewFile(
					person.html,
					person.css,
					person.js,
					frame,
					person.id
				);
			}
		});
	}

	createPreviewFile(html, css, js, frame, personId) {
		let frameRefreshPromise = null;
		let cachedSandboxAttribute = '';

		const versionMatch = navigator.userAgent.match(/Chrome\/(\d+)/);

		const shouldInlineJs = true;
		var contents = getCompleteHtml(html, css, shouldInlineJs ? js : null, {});
		var blob = new Blob([contents], { type: 'text/plain;charset=UTF-8' });
		var blobjs = new Blob([js], { type: 'text/plain;charset=UTF-8' });

		// Track if people have written code.
		if (!trackEvent.hasTrackedCode && (html || css || js)) {
			trackEvent('fn', 'hasCode');
			trackEvent.hasTrackedCode = true;
		}

		if (this.detachedWindow) {
			console.log('✉️ Sending message to detached window');
			this.detachedWindow.postMessage({ contents }, '*');
		} else {
			// 1. we refresh the frame so that all JS is cleared in the frame. this will
			// break the iframe since sandboxed frame isn't served by SW (needed for offline support)
			// 2. we cache and remove the sandbox attribute and refresh again so that it gets served by SW
			// 3. we add back cached sandbox attr & write the contents to the iframe
			const refreshAndDo = fn => {
				frameRefreshPromise =
					frameRefreshPromise ||
					// Race earlier had a settimeout too as a fallback. It was removed because onload
					// was firing 100% times.
					// TODO: remove race
					Promise.race([
						new Promise(resolve => {
							frame.onload = () => {
								resolve('onload');
							};
						})
					]);

				frameRefreshPromise.then(resolutionReason => {
					frameRefreshPromise = null;
					console.log('resolved with ', resolutionReason);
					fn();
				});

				frame.src = frame.src;
			};
			const writeInsideIframe = () => {
				if (!cachedSandboxAttribute && window.DEBUG) {
					// alert('sandbox empty');
				}
				console.log('sending PM');

				frame.contentWindow.postMessage({ contents, id: personId }, '*');
			};
			// refreshAndDo(() => {
			// 	cachedSandboxAttribute = this.frame.getAttribute('sandbox');
			// 	// console.log('removing sandbox', sandbox);
			// 	// this.frame.setAttribute('sweet', sandbox);
			// 	// this.frame.removeAttribute('sandbox');
			// 	refreshAndDo(writeInsideIframe);
			// });
			refreshAndDo(writeInsideIframe);
		}
	}

	showModal(person) {
		this.setState({
			modal: {
				show: true,
				html: person.html || '',
				css: person.css || '',
				js: person.js || ''
			}
		});
	}

	render(props, { catalogs = {}, prefs = {} }) {
		return (
			<I18nProvider language={this.state.prefs.lang} catalogs={catalogs}>
				<div class={this.getRootClasses()}>
					<div class="main-container">
						<div style="display: flex; flex-wrap: wrap;">
							{this.state.people.map(person => (
								<div
									key={person.id}
									style="background: #fff; width: 512px; height: 512px; color: #000; position: relative; margin: 12px;"
								>
									<div
										onClick={() => this.showModal(person)}
										style="position: absolute; bottom: 0; right: 0; background: rgba(128, 128, 128, 0.8); padding: 6px;  border-radius: 20px 0 0 0;"
									>
										<div>{person.id}</div>
										<div>
											Score: {person.score ? person.score.toFixed(2) : '--.--'}%
										</div>
										<div>
											Chars:{' '}
											{person.html.length +
												person.css.length +
												person.js.length}
										</div>
									</div>
									<iframe
										src="http://localhost:7888/preview.htm"
										width="512px"
										height="512px"
										ref={el => (person.frame = el)}
										frameborder="0"
										id={'frame-' + person.id}
										sandbox="allow-same-origin allow-downloads allow-forms allow-modals allow-pointer-lock allow-popups allow-presentation allow-scripts allow-top-navigation-by-user-activation"
										allow="accelerometer; camera; encrypted-media; display-capture; geolocation; gyroscope; microphone; midi; clipboard-read; clipboard-write; web-share"
										allowpaymentrequest="true"
										allowfullscreen="true"
									/>
								</div>
							))}
						</div>
					</div>
				</div>
				<Modal
					extraClasses=""
					show={this.state.modal.show}
					closeHandler={() => {
						this.setState({
							modal: {
								show: false,
								html: '',
								css: '',
								js: ''
							}
						});
					}}
				>
					<VStack align="stretch" gap={2}>
						<div tag="p">{this.state.modal.html}</div>
						<hr />
						<div tag="p">{this.state.modal.css}</div>
						<hr />
						<div>{this.state.modal.js}</div>
					</VStack>
				</Modal>
			</I18nProvider>
		);
	}
}
