import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import StatusPanel from '../../src/city/StatusPanel'

afterEach(cleanup)

const service = (id: string, hostName: string) => ({
  id,
  name: id,
  hostName,
  buildingId: `${hostName}-building`,
  plateId: `${hostName}-plate`,
  status: 'down' as const,
  results: [],
})

it('lists the services of the status with their host', () => {
  render(
    <StatusPanel
      status="down"
      services={[service('web', 'nas'), service('db', 'vm')]}
    />,
  )

  expect(screen.getByLabelText('Services down')).toBeTruthy()
  expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toEqual([
    '📈webnas',
    '📈dbvm',
  ])
})

it('says so when no service has the status', () => {
  render(<StatusPanel status="unknown" services={[]} />)

  expect(screen.getByLabelText('Services unknown')).toBeTruthy()
  expect(screen.getByText('No services.')).toBeTruthy()
})

it('puts a building icon button left of each service, that selects the service', async () => {
  const onSelect = vi.fn()
  const web = service('web', 'nas')
  render(
    <StatusPanel
      status="down"
      services={[web, service('db', 'vm')]}
      onSelect={onSelect}
    />,
  )

  const buttons = screen.getAllByRole('button', { name: /^Go to the building/ })
  expect(buttons.map((b) => b.getAttribute('aria-label'))).toEqual([
    'Go to the building of web',
    'Go to the building of db',
  ])
  expect(buttons.map((b) => b.textContent)).toEqual(['🏢', '🏢'])
  await userEvent.click(buttons[0])
  expect(onSelect).toHaveBeenCalledWith(web)
})

it('does nothing when the card itself is clicked', async () => {
  const onSelect = vi.fn()
  render(
    <StatusPanel
      status="down"
      services={[service('web', 'nas')]}
      onSelect={onSelect}
    />,
  )

  await userEvent.click(screen.getByText('web'))
  await userEvent.click(screen.getByText('nas'))
  await userEvent.click(screen.getAllByRole('listitem')[0])
  expect(onSelect).not.toHaveBeenCalled()
})

it('has no building button when nothing can be selected', () => {
  render(<StatusPanel status="down" services={[service('web', 'nas')]} />)

  expect(screen.queryAllByRole('button', { name: /building/ })).toEqual([])
})

it('puts a graph button right of the building one, a little apart', () => {
  render(
    <StatusPanel
      status="down"
      services={[service('web', 'nas')]}
      onSelect={vi.fn()}
    />,
  )

  const building = screen.getByRole('button', { name: /building of web/ })
  const graph = screen.getByRole('button', { name: 'Graph of web' })
  expect(graph.textContent).toBe('📈')
  expect(building.parentElement).toBe(graph.parentElement)
  expect(building.nextElementSibling).toBe(graph)
  expect(graph.parentElement!.classList.contains('panel-actions')).toBe(true)
})

it('opens the graph of a service, and closes it with the button or its cross', async () => {
  render(
    <StatusPanel
      status="down"
      services={[service('web', 'nas'), service('db', 'vm')]}
      onSelect={vi.fn()}
    />,
  )
  const region = () =>
    screen.queryByRole('region', { name: 'Response times of web' })
  expect(region()).toBeNull()

  const button = screen.getByRole('button', { name: 'Graph of web' })
  expect(button.getAttribute('aria-pressed')).toBe('false')
  await userEvent.click(button)
  expect(region()).toBeTruthy()
  expect(button.getAttribute('aria-pressed')).toBe('true')

  await userEvent.click(button)
  expect(region()).toBeNull()

  await userEvent.click(button)
  await userEvent.click(screen.getByRole('button', { name: 'Close the graph' }))
  expect(region()).toBeNull()
})

it('shows the graph of one service at a time, and drops it when the service leaves the list', async () => {
  const { rerender } = render(
    <StatusPanel
      status="down"
      services={[service('web', 'nas'), service('db', 'vm')]}
    />,
  )

  await userEvent.click(screen.getByRole('button', { name: 'Graph of web' }))
  await userEvent.click(screen.getByRole('button', { name: 'Graph of db' }))
  expect(screen.getAllByRole('region')).toHaveLength(1)
  expect(
    screen.getByRole('region', { name: 'Response times of db' }),
  ).toBeTruthy()

  rerender(<StatusPanel status="down" services={[service('web', 'nas')]} />)
  expect(screen.queryByRole('region')).toBeNull()
})
