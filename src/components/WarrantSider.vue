<script setup lang="ts">
import SiderContent from '@/components/SiderContent.vue'
</script>

<template>
  <!--
    桌面（≥ 1024px）：固定左側欄 288px
    小螢幕（< lg）：hidden — 由 App.vue 的 Drawer 取代
  -->
  <a-layout-sider
    class="hidden lg:flex overflow-hidden border-r border-gray-200"
    :width="288"
    theme="light"
  >
    <SiderContent />
  </a-layout-sider>
</template>
