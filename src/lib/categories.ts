import { MY_PHOTOS_CATEGORY, type PuzzleGroup } from './puzzleGroups'

/** Preferred display order for known categories; anything else sorts alphabetically after these. My Photos is always last. */
const CATEGORY_ORDER = ['fantasy', 'dinosaurs', 'animals']

const CATEGORY_META: Record<string, { label: string; emoji: string }> = {
  fantasy: { label: 'Fantasy', emoji: '🐉' },
  dinosaurs: { label: 'Dinosaurs', emoji: '🦕' },
  animals: { label: 'Animals', emoji: '🐾' },
  [MY_PHOTOS_CATEGORY]: { label: 'My Photos', emoji: '📷' },
}

function humanizeSlug(slug: string): string {
  return slug.split('-').map((word) => word[0].toUpperCase() + word.slice(1)).join(' ')
}

export function categoryLabel(slug: string): string {
  return CATEGORY_META[slug]?.label ?? humanizeSlug(slug)
}

export function categoryEmoji(slug: string): string {
  return CATEGORY_META[slug]?.emoji ?? '📁'
}

export interface CategoryFolder {
  slug: string
  label: string
  emoji: string
  thumbnail?: string
  count: number
}

function categoryRank(slug: string): number {
  if (slug === MY_PHOTOS_CATEGORY) return Infinity
  const index = CATEGORY_ORDER.indexOf(slug)
  return index === -1 ? CATEGORY_ORDER.length : index
}

/** Buckets puzzle groups into category folders for the top-level gallery view. My Photos is always included, even when empty, so "Add your photo" has a home. */
export function buildCategoryFolders(groups: PuzzleGroup[]): CategoryFolder[] {
  const bySlug = new Map<string, PuzzleGroup[]>()
  bySlug.set(MY_PHOTOS_CATEGORY, [])
  for (const slug of CATEGORY_ORDER) bySlug.set(slug, [])

  for (const group of groups) {
    const members = bySlug.get(group.category)
    if (members) members.push(group)
    else bySlug.set(group.category, [group])
  }

  return [...bySlug.entries()]
    .map(([slug, members]) => ({
      slug,
      label: categoryLabel(slug),
      emoji: categoryEmoji(slug),
      thumbnail: members[0]?.thumbnail,
      count: members.length,
    }))
    .sort((a, b) => {
      const rankDiff = categoryRank(a.slug) - categoryRank(b.slug)
      return rankDiff !== 0 ? rankDiff : a.label.localeCompare(b.label)
    })
}
