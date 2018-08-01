import React, {Component, PureComponent, unstable_AsyncMode} from 'react';
import {flushSync, render, unstable_deferredUpdates} from 'react-dom';
import _ from 'lodash';
import Charts from './Charts';
import Clock from './Clock';
import './index.css';

let cachedData = new Map();

class App extends PureComponent {
  state = {
    value: '',
    strategy: 'sync',
    showDemo: true,
    showClock: false,
  };

  // Random data for the chart
  getStreamData(input) {
    if (cachedData.has(input)) {
      return cachedData.get(input);
    }
    const multiplier = input.length !== 0 ? input.length : 1;
    const complexity =
      (parseInt(window.location.search.substring(1), 10) / 100) * 25 || 25;
    const data = _.range(5).map(t =>
      _.range(complexity * multiplier).map((j, i) => {
        return {
          x: j,
          y: (t + 1) * _.random(0, 255),
        };
      })
    );
    cachedData.set(input, data);
    return data;
  }

  componentDidMount() {
    window.addEventListener('keydown', e => {
      if (e.key.toLowerCase() === '?') {
        e.preventDefault();
        this.setState(state => ({
          showClock: !state.showClock,
        }));
      }
    });
  }

  handleChartClick = e => {
    if (this.state.showDemo) {
      if (e.shiftKey) {
        this.setState({showDemo: false});
      }
      return;
    }
    if (this.state.strategy !== 'async') {
      this.setState(state => ({
        showDemo: !state.showDemo,
      }));
      return;
    }
    if (this._ignoreClick) {
      return;
    }
    this._ignoreClick = true;

    unstable_deferredUpdates(() => {
      this.setState({showDemo: true}, () => {
        this._ignoreClick = false;
      });
    });
  };

  debouncedHandleChange = _.debounce(value => {
    if (this.state.strategy === 'debounced') {
      flushSync(() => {
        this.setState({value: value});
      });
    }
  }, 1000);

  renderOption(strategy, label, enabled) {
    const {strategy: currentStrategy} = this.state;
    return (
      <label
        className={strategy === currentStrategy ? 'selected' : null}
        style={{opacity: enabled ? 1 : 0.5}}>
        <input
          type="radio"
          disabled={!enabled}
          checked={strategy === currentStrategy}
          onChange={() => this.setState({strategy})}
        />
        {label}
      </label>
    );
  }

  handleChange = e => {
    const value = e.target.value;
    const {strategy} = this.state;
    switch (strategy) {
      case 'sync':
        this.setState({value});
        break;
      case 'debounced':
        this.debouncedHandleChange(value);
        break;
      case 'async':
        unstable_deferredUpdates(() => {
          this.setState({value});
        });
        break;
      default:
        break;
    }
  };

  render() {
    const Wrapper =
      this.state.strategy === 'async' ? unstable_AsyncMode : 'div';
    const {showClock} = this.state;
    const data = this.getStreamData(this.state.value);
    return (
      <div className="container">
        <div className="rendering">
          {this.renderOption('sync', 'Synchronous', true)}
          {this.renderOption('debounced', 'Debounced', true)}
          {this.renderOption(
            'async',
            'Asynchronous',
            false
          ) /* TODO Fix async demo and re-enable */}
        </div>
        <input
          className={'input ' + this.state.strategy}
          placeholder="longer input → more components and DOM nodes"
          defaultValue={this.state.input}
          onChange={this.handleChange}
        />
        <Wrapper>
          <div className="demo" onClick={this.handleChartClick}>
            {this.state.showDemo && (
              <Charts data={data} onClick={this.handleChartClick} />
            )}
            <div style={{display: showClock ? 'block' : 'none'}}>
              <Clock />
            </div>
          </div>
        </Wrapper>
      </div>
    );
  }
}

const container = document.getElementById('root');
render(<App />, container);
