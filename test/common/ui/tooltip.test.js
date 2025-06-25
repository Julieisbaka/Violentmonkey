import { mount } from '@vue/test-utils';
import Tooltip from '@/common/ui/tooltip.vue';

describe('Tooltip', () => {
  it('renders slot content', () => {
    const wrapper = mount(Tooltip, {
      slots: { default: '<span>Hover me</span>' },
      props: { content: 'Tooltip text' },
    });
    expect(wrapper.text()).toContain('Hover me');
  });
  it('shows tooltip on hover', async () => {
    const wrapper = mount(Tooltip, {
      slots: { default: '<span>Hover me</span>' },
      props: { content: 'Tooltip text' },
    });
    await wrapper.trigger('mouseenter');
    expect(wrapper.html()).toContain('Tooltip text');
  });
});
