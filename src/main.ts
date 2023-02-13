import {
	TFile,
	Plugin,
	MarkdownView,
	debounce,
	Debouncer,
	WorkspaceLeaf,
	addIcon,
} from "obsidian";
import { VIEW_TYPE_STATS_TRACKER } from "./constants";
import StatsTrackerView from "./view";

interface WordCount {
	initial: number;
	current: number;
}

interface DDailyStatsSettings {
	dayCounts: Record<string, number>;
	dayToWordCount: Record<string, Record<string, WordCount>>;
}

const DEFAULT_SETTINGS: DDailyStatsSettings = {
	dayCounts: {},
	dayToWordCount: {},
};

export default class DDailyStats extends Plugin {
	settings: DDailyStatsSettings;
	statusBarEl: HTMLElement;
	currentWordCount: number;
	today: string;
	debouncedUpdate: Debouncer<[contents: string, filepath: string]>;

	private view: StatsTrackerView;

	async onload() {
		await this.loadSettings();

		this.statusBarEl = this.addStatusBarItem();
		this.updateDate();
		if (this.settings.dayCounts.hasOwnProperty(this.today)) {
			this.updateCounts();
		} else {
			this.currentWordCount = 0;
		}

		this.debouncedUpdate = debounce(
			(contents: string, filepath: string) => {
				this.updateWordCount(contents, filepath);
			},
			400,
			false
		);

		this.registerView(
			VIEW_TYPE_STATS_TRACKER,
			(leaf: WorkspaceLeaf) =>
				(this.view = new StatsTrackerView(
					leaf,
					this.settings.dayCounts
				))
		);

		this.addCommand({
			id: "dan-show-daily-stats-tracker-view",
			name: "Dan Open tracker view",
			checkCallback: (checking: boolean) => {
				if (checking) {
					return (
						this.app.workspace.getLeavesOfType(
							VIEW_TYPE_STATS_TRACKER
						).length === 0
					);
				}
				this.initLeaf();
			},
		});

		this.registerEvent(
			this.app.workspace.on(
				"quick-preview",
				this.onQuickPreview.bind(this)
			)
		);

		this.registerInterval(
			window.setInterval(() => {
				this.statusBarEl.setText(
					this.currentWordCount + " words today "
				);
			}, 200)
		);

		addIcon(
			"bar-graph",
			`<path fill="currentColor" stroke="currentColor" d="M122.88,105.98H9.59v-0.02c-2.65,0-5.05-1.08-6.78-2.81c-1.72-1.72-2.79-4.11-2.79-6.75H0V0h12.26v93.73h110.62V105.98 L122.88,105.98z M83.37,45.6h19.55c1.04,0,1.89,0.85,1.89,1.89v38.46c0,1.04-0.85,1.89-1.89,1.89H83.37 c-1.04,0-1.89-0.85-1.89-1.89V47.5C81.48,46.46,82.33,45.6,83.37,45.6L83.37,45.6z M25.36,22.07h19.55c1.04,0,1.89,0.85,1.89,1.89 v62c0,1.04-0.85,1.89-1.89,1.89H25.36c-1.04,0-1.89-0.85-1.89-1.89v-62C23.47,22.92,24.32,22.07,25.36,22.07L25.36,22.07 L25.36,22.07z M54.37,8.83h19.54c1.04,0,1.89,0.85,1.89,1.89v75.24c0,1.04-0.85,1.89-1.89,1.89H54.37c-1.04,0-1.89-0.85-1.89-1.89 V10.72C52.48,9.68,53.33,8.83,54.37,8.83L54.37,8.83z"/>`
		);
		this.registerInterval(
			window.setInterval(() => {
				this.updateDate();
				this.saveSettings();
			}, 1000)
		);

		if (this.app.workspace.layoutReady) {
			this.initLeaf();
		} else {
			this.registerEvent(
				this.app.workspace.on("layout-ready", this.initLeaf.bind(this))
			);
		}
	}

	initLeaf(): void {
		if (
			this.app.workspace.getLeavesOfType(VIEW_TYPE_STATS_TRACKER).length
		) {
			return;
		}
		this.app.workspace.getRightLeaf(false).setViewState({
			type: VIEW_TYPE_STATS_TRACKER,
		});
	}

	onQuickPreview(file: TFile, contents: string) {
		if (this.app.workspace.getActiveViewOfType(MarkdownView)) {
			this.debouncedUpdate(contents, file.path);
		}
	}

	//Credit: better-word-count by Luke Leppan (https://github.com/lukeleppan/better-word-count)
	getWordCount(text: string) {
		let words: number = 0;

		const matches = text.match(
			/[a-zA-Z0-9_\u0392-\u03c9\u00c0-\u00ff\u0600-\u06ff]+|[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff\u3040-\u309f\uac00-\ud7af]+/gm
		);

		if (matches) {
			for (let i = 0; i < matches.length; i++) {
				if (matches[i].charCodeAt(0) > 19968) {
					words += matches[i].length;
				} else {
					words += 1;
				}
			}
		}

		return words;
	}

	updateWordCount(contents: string, filepath: string) {
		const curr = this.getWordCount(contents);
		let todayWordCount = this.settings.dayToWordCount[this.today];
		if (!todayWordCount) {
			this.settings.dayToWordCount[this.today] = {};
			todayWordCount = this.settings.dayToWordCount[this.today];
		}
		if (todayWordCount.hasOwnProperty(filepath)) {
			//updating existing file
			todayWordCount[filepath].current = curr;
		} else {
			// TODO: i believe this will be triggered whether it is actually a new file
			// or if the file was just opened for the first time in the session
			// i need to differentiate between the two, and if it is new, set the
			// initial value to 0

			//created new file during session
			todayWordCount[filepath] = {
				initial: curr,
				current: curr,
			};
		}

		this.updateCounts();
	}

	updateDate() {
		const d = new Date();
		this.today = d.getFullYear() + "/" + d.getMonth() + "/" + d.getDate();
	}

	updateCounts() {
		let todayWordCount = this.settings.dayToWordCount[this.today];
		if (!todayWordCount) {
			this.settings.dayToWordCount[this.today] = {};
		}
		this.currentWordCount = Object.values(
			this.settings.dayToWordCount[this.today]
		)
			.map((wordCount) =>
				Math.max(0, wordCount.current - wordCount.initial)
			)
			.reduce((a, b) => a + b, 0);
		this.settings.dayCounts[this.today] = this.currentWordCount;
	}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData()
		);
	}

	async saveSettings() {
		if (Object.keys(this.settings.dayCounts).length > 0) {
			//ensuring we never reset the data by accident
			await this.saveData(this.settings);
		}
	}
}
