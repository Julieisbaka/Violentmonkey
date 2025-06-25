import { mount } from '@vue/test-utils';
import Modal from '@/common/ui/modal.vue';

describe('Modal', () => {
  it('renders slot content when open', () => {
    const wrapper = mount(Modal, {
      props: { modelValue: true },
      slots: { default: '<div>Modal Content</div>' },
    });
    expect(wrapper.html()).toContain('Modal Content');
  });
  it('does not render when closed', () => {
    const wrapper = mount(Modal, {
      props: { modelValue: false },
      slots: { default: '<div>Modal Content</div>' },
    });
    expect(wrapper.html()).not.toContain('Modal Content');
  });
});
