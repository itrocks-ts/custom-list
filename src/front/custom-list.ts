import { defaultOptions } from '@itrocks/xtarget/xtarget.js'
import { XTarget }        from '@itrocks/xtarget/xtarget.js'
import { xTargetCall }    from '@itrocks/xtarget/xtarget.js'
import { context }        from './context.js'
import { currentList }    from './context.js'
import { settled }        from './context.js'

export { customListBrowserDependsOn } from './context.js'

let breadcrumbGeneration = 0
let clickTimer: ReturnType<typeof setTimeout> | undefined
let held = false
let holdTimer: ReturnType<typeof setTimeout> | undefined
let listening = false
let pointer: { id: number; x: number; y: number } | undefined
let suppressClick = 0

function cancelHold(): void
{
	clearTimeout(holdTimer)
	pointer = undefined
}

function listen(): void
{
	if (listening) return
	listening = true

	document.addEventListener('click', event =>
	{
		const anchor = trigger(event)
		if (!anchor) return
		if (!currentList(anchor.dataset.customListRoute!)) {
			context.loadingRoute = anchor.dataset.customListRoute
			return
		}
		event.preventDefault()
		event.stopImmediatePropagation()
		clearTimeout(clickTimer)
		if ((Date.now() < suppressClick) || (event.detail > 1)) return
		clickTimer = setTimeout(() => void open(anchor, false), 300)
	}, true)

	document.addEventListener('contextmenu', event =>
	{
		const anchor = trigger(event)
		if (anchor && currentList(anchor.dataset.customListRoute!)) {
			event.preventDefault()
		}
	}, true)

	document.addEventListener('dblclick', event =>
	{
		const anchor = trigger(event)
		if (!anchor || !currentList(anchor.dataset.customListRoute!)) return
		event.preventDefault()
		event.stopImmediatePropagation()
		clearTimeout(clickTimer)
		void open(anchor, true)
	}, true)

	document.addEventListener('keydown', event =>
	{
		const anchor = trigger(event)
		if (!anchor || !currentList(anchor.dataset.customListRoute!)) return
		if (!['Enter', ' ', 'F2'].includes(event.key)) return
		event.preventDefault()
		event.stopImmediatePropagation()
		void open(anchor, (event.key === 'F2') || event.shiftKey)
	}, true)

	document.addEventListener('pointercancel', cancelHold, true)

	document.addEventListener('pointerdown', event =>
	{
		const anchor = trigger(event)
		cancelHold()
		held = false
		if (!anchor || (event.button !== 0) || !currentList(anchor.dataset.customListRoute!)) return
		pointer   = { id: event.pointerId, x: event.clientX, y: event.clientY }
		holdTimer = setTimeout(() => {
			held = true
			clearTimeout(clickTimer)
			suppressClick = Date.now() + 1000
			void open(anchor, true)
		}, 500)
	}, true)

	document.addEventListener('pointermove', event =>
	{
		if (pointer?.id === event.pointerId && (Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y) > 10)) {
			cancelHold()
		}
	}, true)

	document.addEventListener('pointerup', () =>
	{
		if (held) {
			suppressClick = Date.now() + 700
		}
		held = false
		cancelHold()
	}, true)

}

export function markListModified(route: string): void
{
	if (!currentList(route)) return
	const active = document.querySelector<HTMLAnchorElement>('ol.breadcrumb a[data-active=true]')
	if (!active || (active.dataset.modified === 'true')) return
	active.dataset.modified = 'true'
}

async function open(anchor: HTMLAnchorElement, editing: boolean): Promise<void>
{
	const route = anchor.dataset.customListRoute!
	if (!currentList(route) || (editing && anchor.dataset.writable !== 'true')) return
	context.opener = anchor
	await settled(route)
	if (!currentList(route)) return
	const href = editing
		? anchor.href.replace('mode=choose', 'mode=edit')
		: anchor.href
	await xTargetCall(href, anchor.target, { ...defaultOptions, targetHistoryDisable: true })
}

function trigger(event: Event): HTMLAnchorElement | null
{
	return (event.target instanceof Element)
		? event.target.closest<HTMLAnchorElement>('ol.breadcrumb a[data-custom-list-route]')
		: null
}

export async function updateListBreadcrumb(heading: HTMLHeadingElement, rendered = false): Promise<void>
{
	listen()
	const generation = ++ breadcrumbGeneration
	const article    = heading.closest<HTMLElement>('main > article[data-route]')
	const breadcrumb = document.querySelector<HTMLOListElement>('ol.breadcrumb')
	if (!article || !breadcrumb) return
	const base = breadcrumb.querySelector<HTMLLIElement>('li[data-action=list]')
	if (!base) return
	base.id     = 'list-default-breadcrumb'
	const route = article.dataset.route!.replace(/\/[0-9,]+$/, '')
	try {
		if (!rendered) {
			// This unattached anchor is transport only; breadcrumb.html owns the rendered links.
			const target   = new XTarget(document.createElement('a'), { ...defaultOptions, targetHistoryDisable: true })
			const setHTML  = target.setHTML.bind(target)
			target.setHTML = (html, selector) => (generation === breadcrumbGeneration && article.isConnected)
				? setHTML(html, selector)
				: undefined
			const view = (article.dataset.action === 'list') ? 'list' : 'record'
			await target.call(`${route}/custom-list?mode=breadcrumb&view=${view}`, '#list-default-breadcrumb')
		}
		if ((generation !== breadcrumbGeneration) || !article.isConnected) return
		if ((context.loadingRoute === route) && (article.dataset.action === 'list')) {
			document.querySelector('main')?.scrollTo(0, 0)
			context.loadingRoute = undefined
		}
	}
	catch (error) {
		console.error('Unable to load list information', error)
	}
}
