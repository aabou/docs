/*
 * Copyright (c) 2016-2019 Martin Donath <martin.donath@squidfunk.com>
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to
 * deal in the Software without restriction, including without limitation the
 * rights to use, copy, modify, merge, publish, distribute, sublicense, and/or
 * sell copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NON-INFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
 * FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS
 * IN THE SOFTWARE.
 */

import { reduce, reverse } from "ramda"
import { Observable, combineLatest } from "rxjs"
import { distinctUntilChanged, map, scan, shareReplay } from "rxjs/operators"

import { ViewportOffset, getElement } from "../../ui"
import { Header } from "../header"

/* ----------------------------------------------------------------------------
 * Types
 * ------------------------------------------------------------------------- */

/**
 * Anchors
 */
export interface Anchors {
  done: HTMLAnchorElement[][]          /* Done anchors */
  next: HTMLAnchorElement[][]          /* Next anchors */
}

/* ----------------------------------------------------------------------------
 * Function types
 * ------------------------------------------------------------------------- */

/**
 * Watch options
 */
interface WatchOptions {
  offset$: Observable<ViewportOffset>  /* Viewport offset observable */
  header$: Observable<Header>          /* Header observable */
}

/* ----------------------------------------------------------------------------
 * Functions
 * ------------------------------------------------------------------------- */

/**
 * Set anchor blur
 *
 * @param el - Anchor element
 * @param blur - Anchor blur
 */
export function setAnchorBlur(
  el: HTMLAnchorElement, blur: boolean
): void {
  el.setAttribute("data-md-state", blur ? "blur" : "")
}

/**
 * Set anchor active
 *
 * @param el - Anchor element
 * @param active - Whether the anchor is active
 */
export function setAnchorActive(
  el: HTMLAnchorElement, active: boolean
): void {
  el.classList.toggle("md-nav__link--active", active)
}

/**
 * Reset anchor
 *
 * @param el - Anchor element
 */
export function resetAnchor(el: HTMLAnchorElement) {
  el.removeAttribute("data-md-state")
  el.classList.remove("md-nav__link--active")
}

/* ------------------------------------------------------------------------- */

/**
 * Create an observable to monitor all anchors in respect to viewport offset
 *
 * @param els - Anchor elements
 * @param options - Options
 *
 * @return Anchors observable
 */
export function watchAnchors(
  els: HTMLAnchorElement[], { offset$, header$ }: WatchOptions
): Observable<Anchors> {

  /* Build index to map anchors to their targets */
  const index = new Map<HTMLAnchorElement, HTMLElement>()
  for (const el of els) {
    const target = getElement(decodeURIComponent(el.hash))
    if (typeof target !== "undefined")
      index.set(el, target)
  }

  /* Build table to map anchor paths to vertical offsets */
  const table = new Map<HTMLAnchorElement[], number>()
  reduce((path: HTMLAnchorElement[], [anchor, target]) => {
    while (path.length) {
      const last = index.get(path[path.length - 1])!
      if (last.tagName >= target.tagName)
        path.pop()
      else
        break
    }
    table.set(reverse(path = [...path, anchor]), target.offsetTop)
    return path
  }, [], [...index])

  /* Compute necessary adjustment for header */
  const adjust$ = header$
    .pipe(
      map(header => 18 + header.height)
    )

  /* Compute partition of done and next anchors */
  const partition$ = combineLatest(offset$, adjust$)
    .pipe(
      scan(([done, next], [{ y }, adjust]) => {

        /* Look forward */
        while (next.length) {
          const [, offset] = next[0]
          if (offset - adjust < y) {
            done = [...done, next.shift()!]
          } else {
            break
          }
        }

        /* Look backward */
        while (done.length) {
          const [, offset] = done[done.length - 1]
          if (offset - adjust >= y) {
            next = [done.pop()!, ...next]
          } else {
            break
          }
        }

        /* Return partition */
        return [done, next]
      }, [[], [...table]]),
      distinctUntilChanged((a, b) => {
        return a[0] === b[0]
            && a[1] === b[1]
      })
    )

  /* Extract anchors and return hot observable */
  return partition$
    .pipe(
      map(([done, next]) => ({
        done: done.map(([anchors]) => anchors),
        next: next.map(([anchors]) => anchors)
      })),
      shareReplay({ bufferSize: 1, refCount: true })
    )
}