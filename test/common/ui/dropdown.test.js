import { mount } from '@vue/test-utils';
import Dropdown from '@/common/ui/dropdown.vue';

describe('Dropdown', () => {
  it('renders button slot', () => {
    const wrapper = mount(Dropdown, {
      slots: { button: '<button>Menu</button>' },
    });
    expect(wrapper.html()).toContain('Menu');
  });
  it('shows menu on click', async () => {
    const wrapper = mount(Dropdown, {
      slots: { button: '<button>Menu</button>', default: '<div>Item</div>' },
    });
    await wrapper.trigger('click');
    expect(wrapper.html()).toContain('Item');
  });
});
