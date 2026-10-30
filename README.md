[![npm version](https://img.shields.io/npm/v/@itrocks/custom-list?logo=npm)](https://www.npmjs.org/package/@itrocks/custom-list)
[![npm downloads](https://img.shields.io/npm/dm/@itrocks/custom-list)](https://www.npmjs.org/package/@itrocks/custom-list)
[![GitHub](https://img.shields.io/github/last-commit/itrocks-ts/custom-list?color=2dba4e&label=commit&logo=github)](https://github.com/itrocks-ts/custom-list)
[![issues](https://img.shields.io/github/issues/itrocks-ts/custom-list)](https://github.com/itrocks-ts/custom-list/issues)
[![discord](https://img.shields.io/discord/1314141024020467782?color=7289da&label=discord&logo=discord&logoColor=white)](https://25.re/ditr)

# custom-list

Named custom list configurations with private and public visibility.

## Installation

Requires Node.js 24 or later and a session-backed list host.

```sh
npm i @itrocks/custom-list
```

## List interaction

A click on either list breadcrumb opens the saved-list chooser. The default list appears first in bold;
accessible saves follow alphabetically. Arrow keys move the choice; Enter or Space loads it.
Double-click or a 500 ms long press opens the save form for signed-in users. Single clicks wait 300 ms.
Enter or Space opens the chooser from the breadcrumb; F2 or Shift+Enter opens the save form.
Escape closes either modal and Tab stays inside it.

A save contains the exact entered name, visible columns in order, applied filters including hidden-column filters,
and ordered sort criteria. Rows, row selection, unapplied filter input and scroll position are excluded.
Loading a save or the default list returns to the beginning of the list.
Only the currently loaded list name is bold; its parent breadcrumb remains in normal weight.
The first settings change removes bold and displays `*` through CSS `::after`,
preserving the name in the DOM;
restoring the same settings does not clear the marker. Only loading or saving clears it.

The save form offers three visibility choices:

| Visibility                         | Readers             | Writers and deleters  |
|------------------------------------|---------------------|-----------------------|
| Private, initially selected         | Owner               | Owner                 |
| Public                              | Everyone            | Any signed-in user    |
| Public, editable by the owner only  | Everyone            | Owner                 |

An active save preselects its visibility. Existing protected saves enforce their current owner's rights,
including when another visibility is requested. Changing the name or visibility creates a copy;
the previous save is retained. Deleting the active save keeps current settings and marks the default list modified.
Anonymous users may choose public lists and the default; they cannot open the save form or mutate save files.
From a record, breadcrumb links return directly to the corresponding default or saved list.

## Files and names

Files live beneath [`dataPath`](https://github.com/itrocks-ts/data-path):

```text
custom-lists/app/movie/films-pretes.json
custom-lists/app/movie/films-pretes-42.json
custom-lists/@itrocks/library/src/module/example.json
```

The host supplies the business module path without its extension or leading `node_modules/`.
Private filenames append the user identifier. Both public visibilities use the same unsuffixed filename.
`simplifiedName(name: string): string` removes combining accents, lowercases, and replaces non-ASCII
alphanumeric runs with hyphens. Overwrite detection uses the complete filename.
The form includes readable filenames and their modification restrictions at opening.
Typing names, changing visibility and confirming overwrites validate locally without server requests.
Validation and overwrite feedback share an area sized for all possible messages at the current width.
Hidden feedback leaves that space blank, keeping the modal height and position stable during input.
An existing writable filename requires the form's overwrite checkbox; changing the name or visibility resets it.
The default display name is reserved after simplification. Empty names and names without usable characters are refused.

The JSON contains `name`, `owner: { id, name }`, `state` and `visibility` (`private`, `public` or `protected`).
Empty filter values are omitted; when no filter remains, `state.filter` is omitted too.
Writes replace files atomically. Concurrent writes deliberately use the last writer, without conflict detection.

## API

`CustomLists(context: CustomListContext, directory = dataPath('custom-lists'))` provides:

- `active(request)` returns the session's active name, file key, visibility and modification marker.
- `check(name, visibility)` checks writability and returns `{ exists, key }`; authentication is required.
- `entries()` returns readable `{ key, name, visibility, blockedBy? }` entries in alphabetical order.
  `blockedBy` identifies another owner who exclusively controls a protected list.
- `key(name, visibility)` validates the name and computes its file key without `.json`.
- `load(request, key)` replaces the session settings. An empty key resets them to the default.
- `modified(request)` marks the current session list modified without comparing it with a file.
- `remove(request, name, visibility)` removes a writable save without clearing current settings.
- `save(request, name, visibility)` writes the current applied settings and selects the resulting save.

Filesystem and read/write methods are asynchronous. Authentication and ownership failures throw `CustomListError`,
whose `status` and `owner` describe the failure. The state and context types are exported from the root.

`CustomList` is the `/custom-list` action. Its HTML method serves the chooser or `?mode=edit` form.
The `?mode=breadcrumb&view=list|record` response renders the breadcrumb through its shared HTML template.
The form uses the standard action list: a Delete link on the left, a Cancel link in the middle and a Save submit
input on the right. Save submits the `save` field to the HTML method; its translated value is a caption only.
The Delete link requests `operation=delete` with the entered name and visibility, opening the standard
`@itrocks/confirm` dialog. Only the confirmation POST removes the save; cancelling preserves it.
Explicit POST `operation=save|delete` remains accepted by the HTML method.
A successful write returns one composite fragment: modal closure, a notification and breadcrumb updates.
It does not reload business rows. Errors prepend an error notification and leave the form open for retry.
Each chooser entry is a link targeting `main`, with the saved filename key in the `custom` query parameter.
The chooser uses monochrome list, user and globe icons for default, private and public configurations.
Selected options use the same pale green background as `property-select`; hovering uses its light grey background.
Links declare `data-target-history="false"`, so these actions preserve the address bar and browser history.
List-save URLs omit the optional `/html` suffix.
Cancellation links use `href="about:blank" target="#modal:replace"`.

Its JSON method accepts `operation=status|entries|check` for reads and POST
`operation=load|save|delete` for session loading or writes. Requests carry `key` when loading,
or `name` and `visibility` when checking, saving or deleting. Responses are never cached.
Protected-list errors include the owner's display name. Input and ownership rules are enforced server-side.

## Usage with the it.rocks framework

The [it.rocks framework](https://github.com/itrocks-ts/framework) supplies context and list-state adapters,
loads the browser integration and stylesheet, and activates the required `xtarget` plugins.
It includes `CustomList.breadcrumbView(request)` in the list response through `listDependsOn({ view })`.
The shell applies the supplied HTML directly, avoiding a follow-up request or an intermediate default breadcrumb.
Column-only changes update the modified marker locally. Record pages enrich the ordinary breadcrumb.
It also loads this package's translations before framework and application translations.
See [framework dependency binding](docs/dependencies.md#integration-with-the-itrocks-framework) for the adapters.

### Framework verification

The framework's `test/custom-list.browser.mjs` exercises actual templates, session integration and browser behaviour.

## Integration outside the it.rocks framework

Bind the host's context and list-state [dependencies](docs/dependencies.md) before serving requests.
The package does not import `@itrocks/list` or `@itrocks/framework`.

### Browser integration

```ts
import { updateListBreadcrumb } from '@itrocks/custom-list/custom-list.js'

await updateListBreadcrumb(document.querySelector('main > article > header > h2')!)
```

The modal templates declare `custom-list.css` in their headers; `xtarget` loads it on first use and avoids duplicates.
The ordinary breadcrumb styles are provided by the existing ux-core application stylesheet.
The modal-only `build.js`, declared by the modal templates, registers dynamic forms through [`build`](https://github.com/itrocks-ts/build) and uses
[`modal`](https://github.com/itrocks-ts/modal) and [`xtarget`](https://github.com/itrocks-ts/xtarget).
The host must install `xtarget` activation and its composite, target-modifier and default-target plugins.
Links declare their real `href` and `target`, and forms declare `action`, `method`
and `target`. JavaScript only delays gestures and waits for pending column writes before targeted navigation or form
submission.
`custom-list.js` provides the breadcrumb API without loading modal behaviour or importing the framework.
Call `updateListBreadcrumb(heading, true)` when the host has applied `CustomList.breadcrumbView(request)`
from the same list response. Otherwise, call `updateListBreadcrumb(heading)` after the ordinary breadcrumb update.
`markListModified(route)` updates the active name and dirty marker locally after a column change.
It activates breadcrumb gestures once on first use. In it.rocks, a small framework-owned adapter imports this module
on the first list or record context and supplies the pending-write dependency.
Neither `build.js` nor `modal.js` is loaded before a modal template requests it.
It prepares the default breadcrumb target, then applies the shared server-rendered composite template.
Browser code handles gestures and state changes without constructing view markup.
An optional browser dependency waits for pending list persistence before saving or loading.
See [dependencies](docs/dependencies.md).

The supplied `fr-FR.csv` translates the feature. Load it through `trLoad()` from
[`translate`](https://github.com/itrocks-ts/translate).

## Verification

```sh
npm test
npm pack --dry-run
```

The framework browser suite can export rendered responses and post-insertion DOM snapshots, then validate them locally:

```sh
HTML_QA_DIR=/tmp/custom-list-html VNU_JAR=/path/to/vnu.jar node test/custom-list.browser.mjs
```

Run this command from the framework package after its fixture build. Use the
[Nu HTML Checker](https://validator.github.io/validator/) JAR; no application HTML is sent to a remote validator.
