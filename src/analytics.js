import { log } from './utils';

/* global ga */

// eslint-disable-next-line max-params
export function trackEvent(category, action, label, value) {
	if (window.DEBUG) {
		log('trackevent', category, action, label, value);
		return;
	}
}
