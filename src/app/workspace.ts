import { ref } from "vue";
import { createCamera } from "../features/panorama";
import { createPlayback } from "../features/chapters";
import { createDiscovery } from "../features/hotspots";
import { createBranch } from "../features/interviews";
import { createJournal } from "../features/journal";
import { createProgram } from "../features/program";
import type { Command, Position } from "../shared/types";
import type { TimelineEntry } from "../features/program";

export function createWorkspace() {
  const camera = createCamera(),
    playback = createPlayback(),
    discovery = createDiscovery(() => playback.state),
    branch = createBranch(),
    journal = createJournal(),
    tab = ref<"story" | "journal" | "program">("story");

  const program = createProgram(
    {
      loadClip: (chapterId, sourceTime, playing) => {
        // 切换章节时原片播放器会随 chapter 计算属性换源，再定位源片时间
        if (playback.state.chapterId !== chapterId) playback.select(chapterId);
        playback.seek(sourceTime);
        playback.state.playing = playing;
      },
      pause: () => {
        playback.state.playing = false;
      },
      resume: () => {
        playback.state.playing = true;
      },
    },
    (entry: TimelineEntry) => {
      // 访谈停顿：自动打开对应人物访谈，讨论停顿仅保持暂停
      if (entry.item.kind === "stop" && entry.item.stop === "interview") {
        enterPerson(entry.item.personId);
      }
    },
  );

  const position = (): Position => ({
    chapterId: playback.state.chapterId,
    time: playback.state.time,
    camera: { ...camera.camera },
    playing: playback.state.playing,
  });

  function enterPerson(id: string) {
    // 编单放映中点开的人物 / 热点属于临时支线：先记住编单当前位置
    if (program.active.value && !branch.personId.value) program.enterExploreBranch();
    branch.enter(id, position());
    playback.state.playing = false;
    discovery.close();
  }

  function openHotspot(id: string) {
    if (program.active.value && !branch.personId.value) program.enterExploreBranch();
    discovery.select(id);
  }

  function dispatch(command: Command) {
    switch (command.type) {
      case "chapter":
        // 编单放映中禁止手动跳章，避免破坏连续放映顺序
        if (branch.personId.value || program.active.value) return;
        playback.select(command.id);
        camera.reset();
        discovery.close();
        break;
      case "seek":
        if (program.active.value) return;
        playback.seek(command.time);
        break;
      case "hotspot":
        openHotspot(command.id);
        break;
      case "return": {
        const saved = branch.leave();
        if (program.active.value) {
          // 结束支线：回到编单对应位置，而不是原片开头
          program.leaveExploreBranch();
          if (saved) camera.restore(saved.camera);
        } else if (saved) {
          playback.select(saved.chapterId);
          playback.seek(saved.time);
          camera.restore(saved.camera);
          playback.state.playing = saved.playing;
        }
        break;
      }
      case "revisit":
        branch.leave();
        // 手记始终回到原片位置；若在编单放映中，先退出编单以免两套时间混淆
        if (program.active.value) program.deactivate();
        playback.select(command.entry.chapterId);
        playback.seek(command.entry.time);
        camera.restore(command.entry.camera);
        discovery.select(command.entry.hotspotId);
        tab.value = "story";
        break;
    }
  }

  function save() {
    const h = discovery.detail.value;
    // 收藏记录的是原片位置（chapterId + 源片 time），与编单连续时间互不混淆
    if (h) journal.save(h, position());
  }

  function startPresentation() {
    tab.value = "story";
    discovery.close();
    branch.leave();
    camera.reset();
    program.activate();
  }
  function exitPresentation() {
    program.deactivate();
    branch.leave();
    playback.select(playback.state.chapterId);
    tab.value = "story";
  }

  return {
    camera,
    playback,
    discovery,
    branch,
    journal,
    program,
    tab,
    position,
    enterPerson,
    openHotspot,
    dispatch,
    save,
    startPresentation,
    exitPresentation,
  };
}
