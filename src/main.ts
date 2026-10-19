import './style.css'
import { createCounter } from './counter.ts'

const app = document.querySelector<HTMLDivElement>('#app')!

app.innerHTML = `
  <main class="card">
    <h1>Minimal Vite + TS</h1>
    <p id="count">Count is 0</p>
    <div class="actions">
      <button id="decrement" type="button">-1</button>
      <button id="increment" type="button">+1</button>
    </div>
    <button id="reset" type="button">Reset</button>
  </main>
`

const counter = createCounter(0)
const count = document.querySelector<HTMLParagraphElement>('#count')!

const render = () => {
  count.textContent = `Count is ${counter.getValue()}`
}

document.querySelector<HTMLButtonElement>('#increment')!.addEventListener('click', () => {
  counter.increment()
  render()
})

document.querySelector<HTMLButtonElement>('#decrement')!.addEventListener('click', () => {
  counter.decrement()
  render()
})

document.querySelector<HTMLButtonElement>('#reset')!.addEventListener('click', () => {
  counter.reset()
  render()
})
