/**
 * Mode-aware autocomplete dropdown for Quick Entry.
 *
 * Trigger characters depend on the active syntax mode:
 *   - Todoist: # → project, @ → label
 *   - Vikunja: + → project, * → label
 */

import { cache } from './vikunja-cache.js'
import { getPrefixes } from '../lib/task-parser/types.ts'

export class AutocompleteDropdown {
  constructor(containerId, onSelect) {
    this.containerEl = document.getElementById(containerId)
    this.listEl = this.containerEl.querySelector('.autocomplete-list')
    this.onSelect = onSelect
    this.syntaxMode = 'todoist'
    this.enabled = true
    this.items = []
    this.itemType = null
    this.activePrefix = null
    this.triggerStart = -1
    this.selectedIndex = 0
    this.visible = false

    // Prevent clicks inside the dropdown from stealing focus
    this.containerEl.addEventListener('mousedown', (e) => {
      e.preventDefault()
    })
  }

  setSyntaxMode(mode) {
    this.syntaxMode = mode
  }

  setEnabled(enabled) {
    this.enabled = enabled
    if (!enabled) this.hide()
  }

  /** Called on every input change to decide whether to show/hide the dropdown. */
  update(inputValue, cursorPos) {
    if (!this.enabled) {
      this.hide()
      return
    }

    const prefixes = getPrefixes(this.syntaxMode)
    const beforeCursor = inputValue.substring(0, cursorPos)

    // Find the last trigger character before cursor that starts a token.
    const projTrigger = this._findTrigger(beforeCursor, prefixes.project)
    const labelTrigger = this._findTrigger(beforeCursor, prefixes.label)

    // Pick whichever trigger is closer to the cursor (later position)
    let trigger = null
    if (projTrigger && labelTrigger) {
      trigger = projTrigger.start > labelTrigger.start ? projTrigger : labelTrigger
    } else {
      trigger = projTrigger || labelTrigger
    }

    if (!trigger) {
      this.hide()
      return
    }

    this.activePrefix = trigger.prefix
    this.triggerStart = trigger.start
    this.itemType = trigger.type

    this.items = trigger.type === 'project'
      ? cache.searchProjects(trigger.query)
      : cache.searchLabels(trigger.query)

    if (this.items.length === 0) {
      this.hide()
      return
    }

    this.selectedIndex = 0
    this._render()
    this._show()
  }

  /**
   * Handle keyboard events. Returns true if the event was consumed by the dropdown.
   */
  handleKeyDown(e) {
    if (!this.visible) return false

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        this.selectedIndex = (this.selectedIndex + 1) % this.items.length
        this._render()
        return true

      case 'ArrowUp':
        e.preventDefault()
        this.selectedIndex = (this.selectedIndex - 1 + this.items.length) % this.items.length
        this._render()
        return true

      case 'Tab':
        if (this.items.length > 0) {
          e.preventDefault()
          this._selectCurrent()
          return true
        }
        return false

      case 'Enter':
        if (this.items.length > 0) {
          // Select the autocomplete item but DON'T consume the event —
          // let Enter propagate to saveTask() so the task is submitted
          // in one keystroke instead of requiring a second Enter press.
          this._selectCurrent()
          return false
        }
        return false

      case 'Escape':
        e.preventDefault()
        this.hide()
        return true

      default:
        return false
    }
  }

  isVisible() {
    return this.visible
  }

  hide() {
    this.visible = false
    this.containerEl.classList.add('hidden')
    this.items = []
    this.activePrefix = null
    this.triggerStart = -1
  }

  _show() {
    this.visible = true
    this.containerEl.classList.remove('hidden')
  }

  _selectCurrent() {
    const item = this.items[this.selectedIndex]
    if (!item || !this.activePrefix) return
    this.onSelect(item, this.triggerStart, this.activePrefix)
    this.hide()
  }

  _render() {
    const typeLabel = this.itemType === 'project' ? 'project' : 'label'
    this.listEl.innerHTML = this.items
      .map((item, i) => {
        const active = i === this.selectedIndex ? ' active' : ''
        return `<div class="autocomplete-item autocomplete-item-${typeLabel}${active}" data-index="${i}">${this._escapeHtml(item.title)}</div>`
      })
      .join('')

    // Attach click handlers
    this.listEl.querySelectorAll('.autocomplete-item').forEach((el) => {
      el.addEventListener('click', () => {
        const idx = parseInt(el.dataset.index, 10)
        this.selectedIndex = idx
        this._selectCurrent()
      })
    })
  }

  _findTrigger(beforeCursor, prefix) {
    const lastIdx = beforeCursor.lastIndexOf(prefix)
    if (lastIdx === -1) return null

    // Trigger must be at start of input or preceded by a space
    if (lastIdx > 0 && beforeCursor[lastIdx - 1] !== ' ') return null

    const query = beforeCursor.substring(lastIdx + prefix.length)

    // If there's a duplicate prefix in the query, no trigger
    if (query.includes(prefix)) return null

    const prefixes = getPrefixes(this.syntaxMode)
    const type = prefix === prefixes.project ? 'project' : 'label'

    return { start: lastIdx, query, prefix, type }
  }

  _escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  }
}
