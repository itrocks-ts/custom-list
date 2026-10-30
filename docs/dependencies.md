# List save dependencies

`customListDependsOn(overrides: Partial<CustomListDependencies>)` merges the supplied top-level dependencies.
The defaults throw explicit configuration errors. Ordinary imports do not start a server or bind host adapters.

## Integration with the it.rocks framework

The [it.rocks framework](https://github.com/itrocks-ts/framework) supplies the server and browser adapters.

### Server binding

The framework binds the context and state adapters in `src/custom-list.ts`, called by `src/dependencies.ts:bind()`:

- Context uses [`class-file.fileOf`](https://github.com/itrocks-ts/class-file),
  [`route`](https://github.com/itrocks-ts/route) identity and translated
  [`class-view`](https://github.com/itrocks-ts/class-view) labels. Module paths omit `node_modules/`.
- User identity and login come from the current session, rather than request parameters.
- State uses `listState` and `replaceListState` from
  [`@itrocks/list/session-state`](https://github.com/itrocks-ts/list).
- `listSessionDependsOn` loads an explicit `custom` query before rendering and marks subsequent changes.
- Data files use [`data-path`](https://github.com/itrocks-ts/data-path).

### Browser binding

The framework supplies the active table's persistence queue through the `itrocks:list-ready` event.
The list response includes `CustomList.breadcrumbView(request)` through `listDependsOn({ view })`.
The browser applies the supplied template before the ordinary breadcrumb updater, without an additional request.
Column changes emit `itrocks:list-change`, which marks the active breadcrumb modified locally after the server save.

## Integration outside the it.rocks framework

### Server contract

```ts
import { customListDependsOn } from '@itrocks/custom-list'

customListDependsOn({
	context: async request => ({
		defaultName: 'Movies',
		key: request.route,
		modulePath: 'app/movie',
		user: request.request.session.user
			? { id: String(request.request.session.user.id), name: request.request.session.user.login }
			: undefined
	}),
	state: {
		read: request => structuredClone(request.request.session.movieSettings ?? {}),
		replace: (request, state) => { request.request.session.movieSettings = structuredClone(state ?? {}) }
	}
})
```

`context(request): Promise<CustomListContext>` resolves the default translated display name, session key,
business module path and optional `{ id, name }` user. Never take user identity from HTTP form data.
`state.read(request): ListState` returns applied settings only, as a copy.
`state.replace(request, state?): void` replaces the complete state; an omitted state restores defaults.
`ListState` contains optional `columns: string[]`, `filter: Record<string, string>` and `sort: [string, boolean][]`.
A sort boolean means descending; tuple order preserves priority.
The request is an [`action-request.Request`](https://github.com/itrocks-ts/action-request).

### Browser contract

`customListBrowserDependsOn({ settled })` from `@itrocks/custom-list/custom-list.js` accepts
`settled(article: HTMLElement): Promise<void>`. The default resolves immediately.
Supply the active list's persistence queue to prevent an already pending column save from replacing a freshly
loaded state.

The form includes names and restrictions for local validation without requests. The server renders the chooser, initial form values and breadcrumbs
through their HTML templates; `mode=breadcrumb` returns the shared composite breadcrumb fragment.
The Save submit input sends the form through `xtarget` to `#notifications:prepend`.
The Delete action is a link targeting `#modal`; it opens the standard confirmation before its POST performs deletion.
`changed.html` updates that notification target, clears the modal and updates the two breadcrumb slots.
Choosing a configuration follows a link to the business list, targeting `main` with its filename key in `custom`.
All cancellation links declare `target="#modal:replace"`; Escape calls the same targeted action.
The modal templates reuse the action-bar and ux-core styles declared by this package.

## Loading and framework context

The framework shell keeps only its context detector and pending-write bridge active.
On the first list or record heading, the bridge imports `@itrocks/custom-list/custom-list.js` and binds `settled`.
This breadcrumb module activates its event listeners on first use and does not import the modal module.
`updateListBreadcrumb(heading, true)` activates a breadcrumb already supplied in the list response without fetching it.
`markListModified(route)` marks the active list locally, retaining its selected name.
The chooser and save templates declare `build.js` in their HTML headers; `xtarget` loads it when the modal is opened.
`build()` handles both content already inserted and subsequent insertions, without registering duplicate forms.

Shared request and interaction state lives in `context.js`, with no framework imports or implicit host binding.
Standalone hosts can use the package without installing any it.rocks framework adapter.
