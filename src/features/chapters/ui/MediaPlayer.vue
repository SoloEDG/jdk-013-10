<script setup lang="ts">
import { onMounted, ref, watch } from "vue";
import type { Playback } from "../model/playback";
import type { Program } from "../../program/model/program";
const props = defineProps<{
  playback: Playback;
  branch: boolean;
  program?: Program;
}>();
const video = ref<HTMLVideoElement>();
function sync() {
  const v = video.value;
  if (!v) return;
  v.muted = props.playback.state.muted;
  v.playbackRate = props.playback.state.rate;
  if (Math.abs(v.currentTime - props.playback.state.time) > 0.4)
    v.currentTime = props.playback.state.time;
  if (props.playback.state.playing && !props.branch)
    v.play().catch(() => {
      props.playback.state.playing = false;
      props.playback.state.error = "请点击播放以继续";
    });
  else v.pause();
}
onMounted(sync);
watch(
  () => [
    props.playback.state.playing,
    props.playback.state.time,
    props.playback.state.muted,
    props.playback.state.rate,
    props.branch,
  ],
  sync,
);
function onTimeUpdate(e: Event) {
  const t = (e.target as HTMLVideoElement).currentTime;
  if (props.program?.active.value) props.program.syncSourceTime(t);
  else if (!props.branch && props.playback.state.playing) props.playback.tick(t);
}
function onEnded() {
  if (props.program?.active.value) props.program.sourceEnded();
  else props.playback.finish();
}
</script>
<template>
  <video
    ref="video"
    class="film-texture"
    :src="playback.chapter.value.video"
    playsinline
    :muted="playback.state.muted"
    preload="auto"
    @loadedmetadata="
      playback.state.ready = true;
      sync();
    "
    @timeupdate="onTimeUpdate"
    @ended="onEnded"
    @error="playback.state.error = '影像加载失败，请刷新重试'"
  />
  <div v-if="playback.state.error" role="status" class="media-warning">
    {{ playback.state.error }}
  </div>
</template>
