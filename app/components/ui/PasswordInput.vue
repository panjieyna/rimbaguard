<script setup lang="ts">
const value = defineModel<string>({ required: true })
defineProps<{
  id: string
  autocomplete: 'current-password' | 'new-password'
  invalid?: boolean
  describedBy?: string
  minlength?: number
  maxlength?: number
}>()
const visible = ref(false)
const ready = ref(false)
onMounted(() => { ready.value = true })
watch(value, (password) => { if (!password) visible.value = false })
</script>

<template>
  <div class="relative">
    <input :id="id" v-model="value" :type="visible ? 'text' : 'password'" :autocomplete="autocomplete" :minlength="minlength" :maxlength="maxlength" required :aria-invalid="Boolean(invalid)" :aria-describedby="describedBy" class="form-input min-h-13 pr-14">
    <button type="button" class="absolute top-1/2 right-1 flex size-11 -translate-y-1/2 items-center justify-center rounded-md text-forest-700 hover:bg-sage-100" :aria-label="visible ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'" :aria-pressed="visible" :aria-controls="id" :disabled="!ready" @click="visible = !visible">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" class="size-5" aria-hidden="true">
        <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" />
        <circle cx="12" cy="12" r="3" />
        <path v-if="visible" d="m3 3 18 18" />
      </svg>
    </button>
  </div>
</template>
