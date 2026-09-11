import { describe, expect, it } from 'vitest'

import { notionFileUrls } from '@/lib/notion-file-urls'

const hosted = (name: string) => `https://prod-files-secure.s3.us-west-2.amazonaws.com/${name}?X-Amz-Expires=3600`

describe('notionFileUrls', () => {
  it('finds a callout icon — the block shape that rotted', () => {
    // The six company logos on /get-in-touch/cv are exactly this. The old
    // collector looked only at block.image, so these were never uploaded.
    const block = {
      type: 'callout',
      callout: {
        rich_text: [{ plain_text: 'I have progressed at MOHARA…', href: null }],
        icon: {
          type: 'file',
          file: { url: hosted('mohara_logo.png'), expiry_time: '2026-09-11T11:14:21.583Z' },
        },
        color: 'default',
      },
    }

    expect(notionFileUrls(block)).toEqual([hosted('mohara_logo.png')])
  })

  it('still finds the image and video files it always found', () => {
    const image = { type: 'image', image: { type: 'file', file: { url: hosted('a.png') } } }
    const video = { type: 'video', video: { type: 'file', file: { url: hosted('b.mp4') } } }

    expect(notionFileUrls(image)).toEqual([hosted('a.png')])
    expect(notionFileUrls(video)).toEqual([hosted('b.mp4')])
  })

  it('finds files on block types nobody enumerated', () => {
    // The point of matching on shape: this needs no new case.
    const pdf = { type: 'pdf', pdf: { type: 'file', file: { url: hosted('doc.pdf') } } }
    const file = { type: 'file', file: { type: 'file', file: { url: hosted('sheet.xlsx') } } }

    expect(notionFileUrls(pdf)).toEqual([hosted('doc.pdf')])
    expect(notionFileUrls(file)).toEqual([hosted('sheet.xlsx')])
  })

  it('leaves external URLs alone', () => {
    // Someone else's host, and no expiry — not what rots.
    const block = {
      type: 'image',
      image: { type: 'external', external: { url: 'https://images.unsplash.com/photo-1' } },
    }

    expect(notionFileUrls(block)).toEqual([])
  })

  it('never mistakes a hyperlink for a file', () => {
    // Downloading these would pull whole web pages into Blob storage.
    const block = {
      type: 'paragraph',
      paragraph: {
        rich_text: [
          {
            plain_text: 'the repository',
            href: 'https://github.com/leothesen/leothesen',
            text: { link: { url: 'https://github.com/leothesen/leothesen' } },
          },
        ],
      },
    }

    expect(notionFileUrls(block)).toEqual([])
  })

  it('does not descend into children', () => {
    // The caller walks the tree one block at a time; descending here would
    // collect a child's files against its parent and upload them twice.
    const block = {
      type: 'column',
      column: {},
      children: [
        { type: 'image', image: { type: 'file', file: { url: hosted('child.png') } } },
      ],
    }

    expect(notionFileUrls(block)).toEqual([])
  })

  it('finds several files in one block', () => {
    const block = {
      type: 'callout',
      callout: {
        icon: { type: 'file', file: { url: hosted('icon.png') } },
      },
      // A page icon travelling alongside, as child_page blocks carry.
      icon: { type: 'file', file: { url: hosted('page-icon.png') } },
    }

    expect(notionFileUrls(block).sort()).toEqual(
      [hosted('icon.png'), hosted('page-icon.png')].sort()
    )
  })

  it('survives the shapes that are not objects', () => {
    expect(notionFileUrls(null)).toEqual([])
    expect(notionFileUrls(undefined)).toEqual([])
    expect(notionFileUrls('a string')).toEqual([])
    expect(notionFileUrls({ type: 'divider', divider: {} })).toEqual([])
    // A `file` key that is not a file object must not throw or yield junk.
    expect(notionFileUrls({ file: 'not-an-object' })).toEqual([])
    expect(notionFileUrls({ file: { expiry_time: 'x' } })).toEqual([])
  })
})
