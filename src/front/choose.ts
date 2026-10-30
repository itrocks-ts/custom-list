import { build }          from '@itrocks/build/build.js'
import { defaultOptions } from '@itrocks/xtarget/xtarget.js'
import { xTargetCall }    from '@itrocks/xtarget/xtarget.js'
import { context }        from './context.js'
import { settled }        from './context.js'

const activated = new WeakSet<HTMLElement>()

function choose(dialog: HTMLElement, route: string): void
{
	if (activated.has(dialog)) return
	activated.add(dialog)
	const opener = context.opener
	if (!opener?.isConnected) {
		dialog.remove()
		return
	}
	const listeners = new AbortController()
	const { signal } = listeners
	const dismiss = () => {
		observer.disconnect()
		listeners.abort()
		opener.setAttribute('aria-expanded', 'false')
		dialog.remove()
	}
	const close = () => {
		dismiss()
		if (opener.isConnected) opener.focus()
	}
	const observer = new MutationObserver(() => {
		if (!dialog.isConnected || !opener.isConnected) dismiss()
	})
	observer.observe(document.body, { childList: true, subtree: true })
	const rect = opener.getBoundingClientRect()
	const top  = Math.max(16, rect.bottom)
	dialog.style.maxHeight = `${Math.max(0, innerHeight - top - 16)}px`
	dialog.style.top = `${top}px`
	dialog.showPopover()
	dialog.style.left = `${Math.max(16, Math.min(rect.left, innerWidth - dialog.offsetWidth - 16))}px`
	opener.setAttribute('aria-expanded', 'true')
	document.addEventListener('pointerdown', event => {
		if ((event.target instanceof Node) && !dialog.contains(event.target) && !opener.contains(event.target)) dismiss()
	}, { signal })
	document.addEventListener('scroll', event => {
		if ((event.target instanceof Node) && !dialog.contains(event.target)) close()
	}, { capture: true, signal })
	window.addEventListener('resize', close, { signal })
	document.addEventListener('keydown', event => {
		if (event.key !== 'Escape') return
		event.preventDefault()
		close()
	}, { signal })
	dialog.addEventListener('keydown', event => {
		if (event.key === 'Tab') close()
	})
	dialog.addEventListener('toggle', () => {
		if (!dialog.matches(':popover-open')) dismiss()
	})
	const container = dialog.querySelector<HTMLElement>('.saved-lists')!
	for (const link of container.querySelectorAll<HTMLAnchorElement>('a')) {
		link.addEventListener('focus', () => {
			for (const option of container.querySelectorAll<HTMLAnchorElement>('a')) {
				option.setAttribute('aria-selected', String(option === link))
				option.tabIndex = (option === link) ? 0 : -1
			}
		})

		let loading = false
		link.addEventListener('click', async event => {
			event.preventDefault()
			event.stopImmediatePropagation()
			if (loading) return
			loading = true
			try {
				await settled(route)
				if (!dialog.isConnected) return
				context.loadingRoute = route
				await xTargetCall(link.href, link.target, { ...defaultOptions, targetHistoryDisable: true })
				close()
			}
			catch (error) {
				const output = dialog.querySelector<HTMLElement>('.error')!
				output.hidden = false
				output.textContent = (error instanceof Error) ? error.message : String(error)
			}
			finally {
				loading = false
			}
		})
	}
	container.addEventListener('keydown', event => {
		const links = [...container.querySelectorAll<HTMLAnchorElement>('a')]
		const index = links.indexOf(document.activeElement as HTMLAnchorElement)
		if ((event.key === ' ') && (index >= 0)) {
			event.preventDefault()
			links[index].click()
			return
		}
		const next
			= (event.key === 'ArrowDown') ? ((index + 1) % links.length)
			: (event.key === 'ArrowUp')   ? ((index - 1 + links.length) % links.length)
			: (event.key === 'Home')      ? 0
			: (event.key === 'End')       ? (links.length - 1)
			: -1
		if (next < 0) return
		event.preventDefault()
		links[next].focus()
	})
	container.querySelector<HTMLAnchorElement>('[aria-selected=true]')?.focus()
}

build<HTMLElement>('.choose-list', dialog => choose(dialog, dialog.dataset.route!))
