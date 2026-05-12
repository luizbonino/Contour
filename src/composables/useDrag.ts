import { reactive } from 'vue';
import type { Widget } from '../types';

export type DragPayload =
  | { type: 'palette'; widget: Widget }
  | { type: 'field'; fieldId: string; fromGroup: string }
  | null;

export interface HoverTarget {
  groupId: string;
  fieldId: string | null;
  position: 'before' | 'after' | 'end';
}

interface DragState {
  payload: DragPayload;
  hover: HoverTarget | null;
}

const state = reactive<DragState>({
  payload: null,
  hover: null,
});

export function useDrag() {
  function startPaletteDrag(e: DragEvent, widget: Widget) {
    state.payload = { type: 'palette', widget };
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'copy';
      e.dataTransfer.setData('text/plain', widget.id);
    }
  }

  function startFieldDrag(e: DragEvent, fieldId: string, fromGroup: string) {
    state.payload = { type: 'field', fieldId, fromGroup };
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', fieldId);
    }
  }

  function endDrag() {
    state.payload = null;
    state.hover = null;
  }

  function setHover(target: HoverTarget | null) {
    state.hover = target;
  }

  return {
    state,
    startPaletteDrag,
    startFieldDrag,
    endDrag,
    setHover,
  };
}
