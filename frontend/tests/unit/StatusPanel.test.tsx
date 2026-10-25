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
    'webnas',
    'dbvm',
  ])
})

it('says so when no service has the status', () => {
  render(<StatusPanel status="unknown" services={[]} />)

  expect(screen.getByLabelText('Services unknown')).toBeTruthy()
  expect(screen.getByText('No services.')).toBeTruthy()
})

it('makes each service box a button that selects the service', async () => {
  const onSelect = vi.fn()
  const web = service('web', 'nas')
  render(
    <StatusPanel
      status="down"
      services={[web, service('db', 'vm')]}
      onSelect={onSelect}
    />,
  )

  const buttons = screen.getAllByRole('button')
  expect(buttons.map((b) => b.textContent)).toEqual(['webnas', 'dbvm'])
  await userEvent.click(buttons[0])
  expect(onSelect).toHaveBeenCalledWith(web)
})

it('has no buttons when nothing can be selected', () => {
  render(<StatusPanel status="down" services={[service('web', 'nas')]} />)

  expect(screen.queryAllByRole('button')).toEqual([])
})
