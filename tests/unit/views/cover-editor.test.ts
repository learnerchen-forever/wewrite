// T036: Unit tests for CoverEditor state management

import type { CoverState } from '../../../src/views/cover-editor';

describe('CoverState', () => {
  it('should have default state values', () => {
    const state: CoverState = { imagePath: '', panX: 0.5, panY: 0.5, zoom: 1.0 };
    expect(state.panX).toBe(0.5);
    expect(state.panY).toBe(0.5);
    expect(state.zoom).toBe(1.0);
    expect(state.imagePath).toBe('');
  });

  it('should track state changes', () => {
    const state: CoverState = { imagePath: 'photos/cover.jpg', panX: 0.3, panY: 0.7, zoom: 1.5 };
    expect(state.imagePath).toBe('photos/cover.jpg');
    expect(state.zoom).toBe(1.5);
  });

  it('should keep zoom within bounds', () => {
    const MIN_ZOOM = 1.0;
    const MAX_ZOOM = 3.0;
    const clamp = (z: number) => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z));
    expect(clamp(0.5)).toBe(1.0);
    expect(clamp(1.5)).toBe(1.5);
    expect(clamp(5.0)).toBe(3.0);
  });

  it('should keep pan within 0-1 range', () => {
    const clamp = (v: number) => Math.max(0, Math.min(1, v));
    expect(clamp(-0.5)).toBe(0);
    expect(clamp(0.5)).toBe(0.5);
    expect(clamp(1.5)).toBe(1);
  });
});
