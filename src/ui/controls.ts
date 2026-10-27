import { updateSettings } from '../state.ts';
import type { Store } from '../store.ts';
import type { Mode, PracticeDirection, ScriptSetting, Settings, SpeedCheck, State } from '../types.ts';
import { $, onSegmented, press } from './dom.ts';
import { hasJapaneseVoice } from './speech.ts';

export interface Controls {
  render(): void;
}

export function createControls(data: Store<State>): Controls {
  const answerBy = $('#answer-by');

  const set = (changes: Partial<Settings>) => data.update(state => updateSettings(state, changes));

  onSegmented('#direction-select', value => set({ direction: value as PracticeDirection }));
  onSegmented('#script-select', value => set({ script: value as ScriptSetting }));
  onSegmented('#mode-select', value => set({ mode: value as Mode }));
  onSegmented('#new-per-day', value => set({ newPerDay: Number(value) }));
  onSegmented('#goal-select', value => set({ goal: Number(value) }));
  onSegmented('#speed-select', value => set({ speedCheck: value as SpeedCheck }));
  onSegmented('#introduce-select', value => set({ introduce: value === 'on' }));

  return {
    render() {
      const { settings } = data.get();
      press('#direction-select', settings.direction);
      press('#script-select', settings.script);
      press('#mode-select', settings.mode);
      press('#new-per-day', settings.newPerDay);
      press('#goal-select', settings.goal);
      press('#speed-select', settings.speedCheck);
      press('#introduce-select', settings.introduce ? 'on' : 'off');
      answerBy.hidden = settings.direction === 'match' || settings.direction === 'write';
      const listen = document.querySelector<HTMLButtonElement>('#direction-select [data-value="listen"]');
      if (listen) {
        listen.title = hasJapaneseVoice()
          ? 'Hear the kana, then pick or type it'
          : 'Needs a Japanese voice for speech. None was found in this browser.';
      }
    },
  };
}
