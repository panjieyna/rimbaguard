<script setup lang="ts">
import type { AdminIconName } from '~/types/admin-ui'

withDefaults(defineProps<{
  title: string
  headingId: string
  icon: AdminIconName
  description?: string
}>(), { description: undefined })
</script>

<template>
  <section class="account-card" :aria-labelledby="headingId">
    <header class="account-card-header">
      <span class="account-card-icon" aria-hidden="true"><AdminIcon :name="icon" class="size-5" /></span>
      <div class="account-card-heading">
        <h2 :id="headingId" class="account-card-title">{{ title }}</h2>
        <p v-if="description" class="account-card-description">{{ description }}</p>
      </div>
      <div v-if="$slots.actions" class="account-card-actions"><slot name="actions" /></div>
    </header>
    <div class="account-card-body"><slot /></div>
  </section>
</template>

<style scoped>
.account-card { min-width: 0; border: 1px solid #E1E7DE; border-radius: 1rem; background: #FFFFFF; box-shadow: 0 1px 2px rgb(23 61 50 / 0.04); }
.account-card-header { display: flex; flex-wrap: wrap; align-items: flex-start; gap: 0.75rem 1rem; border-bottom: 1px solid #EDF1EB; padding: 1.25rem; }
.account-card-icon { display: flex; width: 2.5rem; height: 2.5rem; flex-shrink: 0; align-items: center; justify-content: center; border-radius: 0.75rem; background: #EAF0E9; color: #285C48; }
.account-card-heading { min-width: 0; flex: 1 1 12rem; }
.account-card-title { font-size: 1.125rem; font-weight: 600; line-height: 1.75rem; color: #173D32; }
.account-card-description { margin-top: 0.125rem; font-size: 0.9375rem; line-height: 1.5rem; color: #5C665F; }
.account-card-actions { display: flex; align-items: center; margin-left: auto; }
.account-card-body { padding: 1.25rem; }
@media (min-width: 40rem) {
  .account-card-header, .account-card-body { padding: 1.5rem; }
}
</style>
