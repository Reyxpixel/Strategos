import './style.css';
import { BootSequence } from './src/boot.js';
import { MapEngine } from './src/map-engine.js';
import { ToolManager } from './src/tools.js';
import { IntelPanel } from './src/intel-panel.js';
import { AreaAnalyzer } from './src/area-analyzer.js';
import { UIController } from './src/ui-controller.js';

// Migrate stale model settings
const savedModel = localStorage.getItem('strategos_gemini_model');
const deprecatedModels = ['gemini-1.5-flash', 'gemini-1.5-pro', 'gemini-2.5-flash', 'gemini-2.5-pro'];
if (savedModel && deprecatedModels.includes(savedModel)) {
  localStorage.setItem('strategos_gemini_model', 'gemini-2.0-flash');
  console.log('[Strategos] Migrated model from', savedModel, 'to gemini-2.0-flash');
}

const boot = new BootSequence();
boot.run().then(() => {
  const map = new MapEngine('map');
  const analyzer = new AreaAnalyzer(map);
  const tools = new ToolManager(map);
  const intel = new IntelPanel();
  const ui = new UIController(map, tools, intel, analyzer);
  ui.init();
  window.strategos = { map, tools, intel, analyzer, ui };
});
