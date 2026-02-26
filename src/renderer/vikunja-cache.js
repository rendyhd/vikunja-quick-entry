/**
 * Lightweight cache for projects and labels fetched via Quick Entry IPC.
 * Used by the autocomplete dropdown to provide instant search results.
 */

class VikunjaCache {
  constructor() {
    this.projects = []
    this.labels = []
  }

  setProjects(items) {
    this.projects = items
  }

  setLabels(items) {
    this.labels = items
  }

  searchProjects(query) {
    if (!query) return this.projects.slice(0, 8)
    const q = query.toLowerCase()
    return this.projects
      .filter((p) => p.title.toLowerCase().includes(q))
      .slice(0, 8)
  }

  searchLabels(query) {
    if (!query) return this.labels.slice(0, 8)
    const q = query.toLowerCase()
    return this.labels
      .filter((l) => l.title.toLowerCase().includes(q))
      .slice(0, 8)
  }
}

export const cache = new VikunjaCache()
