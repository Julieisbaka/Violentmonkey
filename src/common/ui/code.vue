<template>
  <div class="flex flex-col">
    <div class="editor-code flex-auto" ref="$cmWrapper"></div>
    <div class="frame-block editor-search flex" v-show="search.show"
         @keydown.esc.exact.stop="clearSearch">
      <form @submit.prevent="goToLine()">
        <span v-text="i18n('labelLineNumber')"></span>
        <input type="text" class="w-1" v-model="jumpPos">
      </form>
      <form class="flex-1" @submit.prevent="findNext()">
        <span v-text="i18n('labelSearch')"></span>
        <tooltip :content="tooltips.find" class="flex-1">
          <!-- id is required for the built-in autocomplete using entered values -->
          <input
            :class="{ 'is-error': !search.hasResult }"
            :title="search.error"
            type="search"
            id="editor-search"
            ref="$search"
            v-model="search.query"
          />
        </tooltip>
        <tooltip :content="tooltips.findPrev" align="end">
          <button type="button" @click="findNext(1)">&lt;</button>
        </tooltip>
        <tooltip :content="tooltips.findNext" align="end">
          <button type="submit">&gt;</button>
        </tooltip>
      </form>
      <form class="flex-1" @submit.prevent="replace()" v-if="!readOnly">
        <span v-text="i18n('labelReplace')"></span>
        <!-- id is required for the built-in autocomplete using entered values -->
        <input class="flex-1" type="search" id="editor-replace" v-model="search.replace">
        <tooltip :content="tooltips.replace" align="end">
          <button type="submit" v-text="i18n('buttonReplace')"></button>
        </tooltip>
        <tooltip :content="tooltips.replaceAll" align="end">
          <button type="button" v-text="i18n('buttonReplaceAll')" @click="replace(1)"></button>
        </tooltip>
      </form>
      <div>
        <tooltip :content="i18n('searchUseRegex')" align="end">
          <toggle-button v-model="search.options.useRegex">.*</toggle-button>
        </tooltip>
        <tooltip :content="i18n('searchCaseSensitive')" align="end">
          <toggle-button v-model="search.options.caseSensitive">Aa</toggle-button>
        </tooltip>
      </div>
      <tooltip content="Esc" align="end">
        <button @click="clearSearch">&times;</button>
      </tooltip>
    </div>
  </div>
</template>

<script>
import { EditorView, basicSetup, keymap } from '@codemirror/basic-setup';
import { EditorState } from '@codemirror/state';
import { javascript } from '@codemirror/lang-javascript';
import { searchKeymap, search, highlightSelectionMatches } from '@codemirror/search';
import { autocompletion } from '@codemirror/autocomplete';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { onMounted, ref, watch, defineProps, defineEmits } from 'vue';
import { i18n } from '@/common';
import { debounce, getUniqId, i18n, sendCmdDirectly } from '@/common';
import { deepEqual, forEachEntry, objectPick } from '@/common/object';
import hookSetting from '@/common/hook-setting';
import options from '@/common/options';
import './code-autocomplete';
import cmDefaults from './code-defaults';
import './code-js-mixed-mode';
import { killTrailingSpaces } from './code-trailing-spaces';

// --- Custom Placeholder for Long Lines ---
import { Decoration, WidgetType, showTooltip } from '@codemirror/view';
import { EditorSelection, Compartment } from '@codemirror/state';

const longLinePlaceholder = () => {
  return EditorView.decorations.compute([EditorState.doc], state => {
    const widgets = [];
    for (let i = 0; i < state.doc.lines; ++i) {
      const line = state.doc.line(i + 1);
      if (line.length > 500) {
        widgets.push(Decoration.widget({
          widget: new class extends WidgetType {
            toDOM() {
              const el = document.createElement('span');
              el.className = 'cm-long-line-placeholder';
              el.textContent = '⟶ Long line truncated for performance';
              return el;
            }
          },
          side: 1
        }).range(line.from));
      }
    }
    return Decoration.set(widgets, true);
  });
};

// --- Custom Keybindings ---
const customKeymap = [
  {
    key: 'Mod-s',
    preventDefault: true,
    run(view) {
      view.contentDOM.dispatchEvent(new CustomEvent('editor-save', { bubbles: true }));
      return true;
    }
  },
  {
    key: 'Mod-d',
    preventDefault: true,
    run(view) {
      const { state, dispatch } = view;
      const ranges = state.selection.ranges.map(r => {
        const line = state.doc.lineAt(r.head);
        return { from: line.from, to: line.to };
      });
      let changes = [];
      for (const { from, to } of ranges) {
        changes.push({ from: to, insert: '\n' + state.doc.sliceString(from, to) });
      }
      dispatch(state.update({ changes }));
      return true;
    }
  },
  {
    key: 'Mod-/',
    run(view) {
      const { state, dispatch } = view;
      const line = state.doc.lineAt(state.selection.main.head);
      const text = line.text;
      let changes;
      if (text.trim().startsWith('//')) {
        const idx = text.indexOf('//');
        changes = { from: line.from + idx, to: line.from + idx + 2, insert: '' };
      } else {
        changes = { from: line.from, insert: '// ' };
      }
      dispatch(state.update({ changes }));
      return true;
    }
  },
  {
    key: 'Mod-g',
    run(view) {
      const line = prompt('Go to line:');
      if (line && !isNaN(line)) {
        const ln = Math.max(1, Math.min(view.state.doc.lines, Number(line)));
        const pos = view.state.doc.line(ln).from;
        view.dispatch({ selection: { anchor: pos }, scrollIntoView: true });
      }
      return true;
    }
  },
];

// --- Theme/User Settings Integration ---
const themeCompartment = new Compartment();
const getTheme = () => {
  return options.get('editorTheme') === 'dark' ? [import('@codemirror/theme-one-dark').then(m => m.oneDark)] : [];
};

// --- Tooltip/Help Overlay Example ---
function showHelpTooltip(view, text) {
  const tooltip = {
    pos: view.state.selection.main.head,
    above: true,
    strictSide: true,
    create() {
      const dom = document.createElement('div');
      dom.className = 'cm-tooltip-help';
      dom.textContent = text;
      return { dom };
    }
  };
  view.dispatch({ effects: showTooltip.of([tooltip]) });
}

// Minimal CodeMirror 6 setup
const props = defineProps({
  value: {
    type: String,
    default: '',
  },
  readOnly: {
    type: Boolean,
    default: false,
  },
});
const emit = defineEmits(['code-dirty', 'ready']);
const $cmWrapper = ref();
const $search = ref();
const jumpPos = ref('');
const search = ref({
  show: false,
  query: '',
  replace: '',
  hasResult: true,
  error: '',
  options: {
    useRegex: false,
    caseSensitive: false,
  },
});
const tooltips = ref({
  find: '',
  findPrev: '',
  findNext: '',
  replace: '',
  replaceAll: '',
});
let view = null;

function doSearch(forward = true) {
  if (!view) return;
  const { query, options } = search.value;
  let re;
  try {
    re = options.useRegex
      ? new RegExp(query, options.caseSensitive ? 'g' : 'gi')
      : query;
    search.value.error = '';
  } catch (e) {
    search.value.error = e.message;
    search.value.hasResult = false;
    return;
  }
  // Use CodeMirror 6 search API
  const state = view.state;
  const cursor = state.doc.toString().search(re);
  if (cursor === -1) {
    search.value.hasResult = false;
  } else {
    search.value.hasResult = true;
    // Move selection to the found position
    if (query) {
      const from = cursor;
      const to = cursor + (typeof query === 'string' ? query.length : state.sliceDoc(cursor).match(re)?.[0]?.length || 0);
      view.dispatch({ selection: { anchor: from, head: to }, scrollIntoView: true });
    }
  }
}

function findNext(reverse = false) {
  doSearch(!reverse);
  if ($search.value) $search.value.focus();
}

function replace(all = false) {
  if (!view || props.readOnly) return;
  const { query, replace: replaceText, options } = search.value;
  let re;
  try {
    re = options.useRegex
      ? new RegExp(query, options.caseSensitive ? 'g' : 'gi')
      : query;
    search.value.error = '';
  } catch (e) {
    search.value.error = e.message;
    return;
  }
  const doc = view.state.doc.toString();
  if (all) {
    let newDoc;
    if (options.useRegex) {
      newDoc = doc.replace(re, replaceText);
    } else {
      newDoc = doc.split(query).join(replaceText);
    }
    view.dispatch({ changes: { from: 0, to: doc.length, insert: newDoc } });
  } else {
    // Replace current selection if it matches
    const sel = view.state.selection.main;
    const selected = view.state.sliceDoc(sel.from, sel.to);
    if ((options.useRegex && re.test(selected)) || (!options.useRegex && selected === query)) {
      view.dispatch({ changes: { from: sel.from, to: sel.to, insert: replaceText } });
    }
    findNext();
  }
}

function clearSearch() {
  search.value.show = false;
  if (view) view.focus();
}

function goToLine() {
  if (!view) return;
  let [line, ch] = jumpPos.value.split(':').map(Number) || [];
  if (line) {
    line -= 1;
    ch = ch ? ch - 1 : 0;
    const pos = view.state.doc.line(line + 1).from + ch;
    view.dispatch({ selection: { anchor: pos }, scrollIntoView: true });
    search.value.show = false;
    view.focus();
  }
}

onMounted(() => {
  if ($cmWrapper.value) {
    view = new EditorView({
      state: EditorState.create({
        doc: props.value,
        extensions: [
          basicSetup,
          javascript(),
          autocompletion(),
          search({ top: true }),
          highlightSelectionMatches(),
          history(),
          keymap.of([
            ...defaultKeymap,
            ...searchKeymap,
            ...historyKeymap,
            indentWithTab,
            ...customKeymap
          ]),
          EditorView.editable.of(!props.readOnly),
          EditorView.updateListener.of(update => {
            if (update.docChanged) {
              emit('code-dirty', true);
            }
          }),
          longLinePlaceholder(),
          themeCompartment.of([]), // will be set below
        ]
      }),
      parent: $cmWrapper.value
    });
    // Set theme after view is created
    const theme = options.get('editorTheme');
    if (theme === 'dark') {
      import('@codemirror/theme-one-dark').then(m => {
        view.dispatch({ effects: themeCompartment.reconfigure([m.oneDark]) });
      });
    }
    emit('ready');
  }
// Watch for theme changes
watch(() => options.get('editorTheme'), (val) => {
  if (view) {
    if (val === 'dark') {
      import('@codemirror/theme-one-dark').then(m => {
        view.dispatch({ effects: themeCompartment.reconfigure([m.oneDark]) });
      });
    } else {
      view.dispatch({ effects: themeCompartment.reconfigure([]) });
    }
  }
});
});
</script>

<script setup>
</script>

<style>
$selectionBg: #d7d4f0; /* copied from codemirror.css */
$selectionDarkBg: rgba(80, 75, 65, .99);

/* compatible with old browsers, e.g. Maxthon 4.4, Chrome 50- */
.editor-code.flex-auto {
  position: relative;
  > div {
    position: absolute;
    width: 100%;
  }
}

.editor-search {
  white-space: pre;
  flex-wrap: wrap; // wrap fields in a narrow window
  > form,
  > div {
    display: flex;
    align-items: center;
    margin-right: .5rem;
  }
  @supports (field-sizing: content) {
    input {
      field-sizing: content;
      min-width: 3ch;
      width: auto;
    }
  }
  span > input { // a tooltip'ed input
    width: 100%;
  }
  .is-error, .is-error:focus {
    border-color: #e85600;
    background: #e8560010;
  }
}

.too-long-placeholder {
  font-style: italic;
}

/* CodeMirror show-hints fix to work here */
.CodeMirror-hints {
  z-index: 9999;
}

/* fix contenteditable selection color bug */
.CodeMirror .CodeMirror-line {
  ::selection {
    background: $selectionBg;
  }
  /* must be used separately otherwise the entire rule is ignored in Chrome */
  ::-moz-selection {
    background: $selectionBg;
  }
}

.cm-matchhighlight {
  background-color: hsla(168, 100%, 50%, 0.15);
}
.cm-trailingspace {
  background: radial-gradient(cornflowerblue, transparent 1px) 0 50% / 1ch 1ch repeat-x;
}
div.CodeMirror span.CodeMirror-matchingbracket { /* the same selector used in codemirror.css */
  color: unset;
  background-color: hsla(102, 80%, 50%, 0.3);
}
.cm-s-default {
  .cm-comment {
    color: #918982;
  }
  .cm-string-2 { // template literal: `example`
    color: #870;
  }
  .cm-string-2.cm-regexp {
    color: #d60;
  }
}

@media (prefers-color-scheme: dark) {
  .cm-matchhighlight {
    background-color: hsla(40, 100%, 50%, 0.1);
    border-bottom-color: hsla(40, 100%, 50%, 0.25);
  }
  .CodeMirror-hints {
    background: var(--bg);
  }
  .CodeMirror-hint {
    color: var(--fg);
  }
  li.CodeMirror-hint-active {
    background: var(--fg);
    color: var(--bg);
  }
  .CodeMirror {
    color: var(--fg);
    background: var(--bg);
    & &-scrollbar-filler,
    & &-gutter-filler {
      background: none;
    }
    & &-gutters {
      border-color: var(--fill-2);
      background-color: var(--fill-0-5);
    }
    & &-selected {
      background: $selectionDarkBg;
    }
    & &-line {
      ::selection {
        background: $selectionDarkBg;
      }
      /* must be used separately otherwise the entire rule is ignored in Chrome */
      ::-moz-selection {
        background: $selectionDarkBg;
      }
    }
    & &-guttermarker {
      color: white;
      &-subtle {
        color: #d0d0d0;
      }
    }
    & &-linenumber {
      color: #666;
    }
    & &-cursor {
      border-color: #f8f8f0;
    }
    & &-activeline-background {
      background: #1a1a1a;
    }
    & &-matchingbracket {
      outline: none;
      background: #444;
      color: yellow !important;
    }
  }
  .cm-s-default {
    // mostly copied from Monokai theme
    .cm-comment {
      color: #75715e;
    }
    .cm-atom {
      color: #ae81ff;
    }
    .cm-number {
      color: #ae81ff;
    }
    .cm-comment.cm-attribute {
      color: #97b757;
    }
    .cm-comment.cm-def {
      color: #bc9262;
    }
    .cm-comment.cm-tag {
      color: #bc6283;
    }
    .cm-comment.cm-type {
      color: #5998a6;
    }
    .cm-property,
    .cm-attribute {
      color: #a6e22e;
    }
    .cm-keyword {
      color: #f92672;
    }
    .cm-builtin {
      color: #66d9ef;
    }
    .cm-string {
      color: #e6db74;
    }
    .cm-string-2 {
      color: #bcb149;
    }
    .cm-string-2.cm-regexp {
      color: #ff00f7;
    }
    .cm-variable {
      color: #f8f8f2;
    }
    .cm-variable-2 {
      color: #9effff;
    }
    .cm-variable-3,
    .cm-type {
      color: #66d9ef;
    }
    .cm-def {
      color: #fd971f;
    }
    .cm-bracket {
      color: #f8f8f2;
    }
    .cm-tag {
      color: #f92672;
    }
    .cm-header {
      color: #ae81ff;
    }
    .cm-link {
      color: #ae81ff;
    }
    .cm-error {
      color: #f8f8f0;
      background: #f92672;
    }
    .cm-operator {
      color: #999
    }
  }
}
</style>
