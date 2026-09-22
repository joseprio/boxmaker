import { place, type Boxes } from './boxes';
import type { LidSettings } from './settings';

/**
 * Where the lid goes, in box space. The box cavity spans [0,x] x [0,y] and the
 * walls end at `zTop` (including any top edge extension).
 */
export interface LidContext {
  x: number;
  y: number;
  zTop: number;
}

/** Port of boxes.py `lids.Lid`: flat, over-the-top and on-top lids plus handles. */
export class Lid {
  constructor(
    private boxes: Boxes,
    private settings: LidSettings,
  ) {}

  /** Returns true when a lid was drawn. */
  draw(ctx: LidContext): boolean {
    const b = this.boxes;
    const t = b.thickness;
    const s = this.settings;
    const { x, y, zTop } = ctx;
    const height = s.height;

    if (s.style === 'flat') {
      b.rectangularWall(x, y, 'eeee', {
        label: 'lid bottom',
        group: 'lid',
        callback: [this.handleCB(x, y)],
        placement: place.plateXY(0, 0, zTop - t),
      });
      b.rectangularWall(x, y, 'EEEE', {
        label: 'lid top',
        group: 'lid',
        callback: [this.handleCB(x, y)],
        placement: place.plateXY(0, 0, zTop),
      });
      this.handleParts(x, y, x / 2, y / 2, zTop - t);
      return true;
    }

    if (s.style === 'overthetop' || s.style === 'ontop') {
      let x2 = x;
      let y2 = y;
      let x0 = 0;
      let y0 = 0;
      let zWall: number;
      if (s.style === 'overthetop') {
        x2 += 2 * t + s.play;
        y2 += 2 * t + s.play;
        x0 = -t - s.play / 2;
        y0 = -t - s.play / 2;
        zWall = zTop - height;
      } else {
        zWall = zTop;
      }
      const zPlate = zWall + height;
      b.rectangularWall(x2, y2, 'ffff', {
        label: 'lid top',
        group: 'lid',
        callback: [this.handleCB(x2, y2)],
        placement: place.plateXY(x0, y0, zPlate),
      });
      b.rectangularWall(x2, height, 'eFFF', {
        label: 'lid front',
        group: 'lid',
        ignoreWidths: [1, 2, 5, 6],
        placement: place.wallXZ(x0, y0, zWall),
      });
      b.rectangularWall(x2, height, 'eFFF', {
        label: 'lid back',
        group: 'lid',
        ignoreWidths: [1, 2, 5, 6],
        placement: place.wallXZ(x0, y0 + y2 + t, zWall),
      });
      b.rectangularWall(y2, height, 'efFf', {
        label: 'lid left',
        group: 'lid',
        ignoreWidths: [1, 2, 5, 6],
        placement: place.wallYZ(x0 - t, y0, zWall),
      });
      b.rectangularWall(y2, height, 'efFf', {
        label: 'lid right',
        group: 'lid',
        ignoreWidths: [1, 2, 5, 6],
        placement: place.wallYZ(x0 + x2, y0, zWall),
      });
      if (s.style === 'ontop') {
        const brim = [2 * t, [90, t], t + height, 90, 4 * t, 90, t + height, [90, t]] as Array<number | [number, number]>;
        const placements = [
          place.wallXZ(x / 2 - t, t, zTop - 2 * t),
          place.wallXZ(x / 2 - t, y, zTop - 2 * t),
          place.wallYZ(0, y / 2 - t, zTop - 2 * t),
          place.wallYZ(x - t, y / 2 - t, zTop - 2 * t),
        ];
        for (const p of placements) {
          b.freePart(() => b.polyline(...brim), { label: 'lid brim', group: 'lid', placement: p });
        }
      }
      this.handleParts(x2, y2, x0 + x2 / 2, y0 + y2 / 2, zPlate);
      return true;
    }
    return false;
  }

  /** Callback cutting the handle slot into a plate of size x*y. */
  handleCB(x: number, y: number): () => void {
    const b = this.boxes;
    const t = b.thickness;
    const handle = this.settings.handle;
    return () => {
      if (handle.startsWith('long')) {
        b.rectangularHole(x / 2, y / 2, x / 2, t);
      } else if (handle === 'knob') {
        b.saved(() => {
          b.moveTo((x - t) / 2, (y - t) / 2, 180);
          const h = 3 * t;
          for (let i = 0; i < 4; i++) b.polyline(h, -90, t, -90, h, 90);
        });
      }
    };
  }

  /** The loose handle parts; (cx, cy) is the slot centre, zPlate the underside of the plate carrying it. */
  private handleParts(x: number, _y: number, cx: number, cy: number, zPlate: number): void {
    const b = this.boxes;
    const t = b.thickness;
    const hh = this.settings.handle_height;
    const style = this.settings.handle;
    if (style.startsWith('long')) {
      let poly: Array<number | [number, number]> = [[90, t / 2], t / 2, 90, t, -90];
      let l: number;
      if (style === 'long_rounded') {
        const r = Math.min(hh / 2, x / 4);
        poly = poly.concat([t + hh - r, [90, r]]);
        l = x / 2 - 2 * r;
      } else if (style === 'long_trapezoid') {
        poly = poly.concat([t, [45, t], (hh - t) * Math.SQRT2, [45, t]]);
        l = x / 2 - 2 * hh;
      } else {
        poly = poly.concat([t, 90, 0, [-90, hh / 2], 0, [90, hh / 2]]);
        l = x / 2 - 2 * hh;
      }
      const full = [x / 2 + t, ...poly, l, ...[...poly].reverse()];
      b.freePart(
        () => {
          b.moveTo(0.5 * t);
          b.polyline(...full);
        },
        { label: 'handle', group: 'handle', placement: place.wallXZ(cx - x / 2 - t, cy + t / 2, zPlate - t) },
      );
    } else if (style === 'knob') {
      const poly: Array<number | [number, number]> = [[90, t / 2], t / 2, 90, t / 2, -90, hh - 2 * t, [90, 3 * t]];
      const variants: Array<[Array<number | [number, number]>, Array<number | [number, number]>]> = [
        [[3 * t, 90, 2 * t + hh / 2, -90, t, -90, hh / 2 + 2 * t, 90, 3 * t], [t]],
        [[7 * t], [0, 90, hh / 2, -90, t, -90, hh / 2, 90, 0]],
      ];
      const placements = [place.wallXZ(cx - 4 * t, cy + t / 2, zPlate - t), place.wallYZ(cx - t / 2, cy - 4 * t, zPlate - t)];
      variants.forEach(([bottom, top], i) => {
        const p = [...bottom, ...poly, ...top, ...[...poly].reverse()];
        b.freePart(
          () => {
            b.moveTo(0.5 * t);
            b.polyline(...p);
          },
          { label: `knob ${i + 1}`, group: 'handle', placement: placements[i] },
        );
      });
    }
  }
}
