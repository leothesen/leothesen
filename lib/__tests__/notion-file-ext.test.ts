import { describe, expect, it } from 'vitest'

import { fileExtFromUrl, isStoredUnder } from '@/lib/notion-file-ext'

// The shape Notion hands out: an S3 object named after the upload, plus a
// signed query string that expires within the hour.
const notion = (name: string) =>
  `https://prod-files-secure.s3.us-west-2.amazonaws.com/space/block/${name}?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Expires=3600`

describe('fileExtFromUrl', () => {
  it('keeps the extension of an image, so no stored image changes name', () => {
    expect(fileExtFromUrl(notion('IMG_2041.jpeg'))).toBe('.jpeg')
    expect(fileExtFromUrl(notion('cover.PNG'))).toBe('.png')
    expect(fileExtFromUrl(notion('photo.webp'))).toBe('.webp')
  })

  it('keeps audio as audio', () => {
    // The Mac Mac miler recording: an MP3 that was stored as .jpg.
    expect(fileExtFromUrl(notion('Mac%20Mac%20miler.mp3'))).toBe('.mp3')
    expect(fileExtFromUrl(notion('voicenote.m4a'))).toBe('.m4a')
  })

  it('keeps video as video', () => {
    // Phone videos arrive as QuickTime .mov files.
    expect(fileExtFromUrl(notion('IMG_4471.MOV'))).toBe('.mov')
    expect(fileExtFromUrl(notion('clip.mp4'))).toBe('.mp4')
  })

  it('keeps a PDF as a PDF', () => {
    expect(fileExtFromUrl(notion('Leo%20Thesen%20CV.pdf'))).toBe('.pdf')
  })

  it('ignores the signed query string when reading the extension', () => {
    expect(fileExtFromUrl('https://x/a/song.mp3?sig=abc.jpg')).toBe('.mp3')
  })

  it('falls back to .jpg for an extensionless image URL, as it always has', () => {
    expect(fileExtFromUrl('https://images.unsplash.com/photo-1506905925346?w=1200')).toBe('.jpg')
  })

  it('falls back to .jpg for an extension it does not know', () => {
    expect(fileExtFromUrl(notion('archive.zip'))).toBe('.jpg')
  })

  it('copes with a URL that is not absolute', () => {
    expect(fileExtFromUrl('/files/track.mp3?x=1')).toBe('.mp3')
  })
})

describe('isStoredUnder', () => {
  const blob = 'https://abc.public.blob.vercel-storage.com/notion-images'

  it('accepts a copy stored under the expected name', () => {
    expect(isStoredUnder(`${blob}/30ec3e8e5b2e29b8.mp3`, '30ec3e8e5b2e29b8.mp3')).toBe(true)
  })

  it('rejects a copy stored before its extension was recognised', () => {
    expect(isStoredUnder(`${blob}/30ec3e8e5b2e29b8.jpg`, '30ec3e8e5b2e29b8.mp3')).toBe(false)
  })

  it('does not match a name that merely ends the same way', () => {
    expect(isStoredUnder(`${blob}/x30ec3e8e5b2e29b8.mp3`, '30ec3e8e5b2e29b8.mp3')).toBe(false)
  })

  it('handles a local path from a run without Blob', () => {
    expect(isStoredUnder('/notion-images/30ec3e8e5b2e29b8.jpg', '30ec3e8e5b2e29b8.jpg')).toBe(true)
  })
})
